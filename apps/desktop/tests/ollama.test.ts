import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { listModels, streamChat, validateOllamaUrl } from '../electron/ollama';

const servers: http.Server[] = [];
async function endpoint(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }))); });
const input = (url: string, onToken: (token: string) => void, signal = new AbortController().signal) => ({ url, model: 'qwen3:0.6b', messages: [{ role: 'user' as const, content: 'Hello' }], signal, onToken });

describe('local model transport', () => {
  it('accepts loopback origins and rejects remote, credential-bearing, and path URLs', () => {
    expect(validateOllamaUrl('http://localhost:11434/')).toBe('http://localhost:11434');
    expect(validateOllamaUrl('http://[::1]:11434')).toBe('http://[::1]:11434');
    for (const url of ['https://example.com', 'http://127.0.0.1@evil.test', 'http://u:p@localhost', 'file:///tmp/a', 'http://localhost/api', 'http://localhost?x=1', 'http://localhost#x']) expect(() => validateOllamaUrl(url)).toThrow();
  });

  it('reads installed models through the real HTTP transport', async () => {
    const url = await endpoint((req, res) => {
      expect(req.url).toBe('/api/tags');
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ models: [{ name: 'qwen3:0.6b', size: 523 }] }));
    });
    expect(await listModels(url)).toEqual([{ name: 'qwen3:0.6b', size: 523 }]);
  });

  it('decodes fragmented NDJSON and split multibyte text without dropping the terminal record', async () => {
    let requestBody = '';
    const url = await endpoint((req, res) => {
      req.on('data', chunk => { requestBody += chunk; });
      req.on('end', () => {
        const data = Buffer.from(`${JSON.stringify({ message: { content: 'Hello 🌍' }, done: false })}\n${JSON.stringify({ message: { content: '!' }, done: true })}`);
        res.setHeader('Content-Type', 'application/x-ndjson');
        const split = data.indexOf(Buffer.from('🌍')) + 2;
        res.write(data.subarray(0, split)); setTimeout(() => res.end(data.subarray(split)), 10);
      });
    });
    let output = ''; await streamChat(input(url, token => { output += token; }));
    expect(output).toBe('Hello 🌍!');
    expect(JSON.parse(requestBody)).toMatchObject({ stream: true, think: false, model: 'qwen3:0.6b', messages: [{ role: 'user', content: 'Hello' }] });
  });

  it('reports truncated responses and in-band model errors as failures', async () => {
    const truncated = await endpoint((_req, res) => res.end(`${JSON.stringify({ message: { content: 'Partial' }, done: false })}\n`));
    await expect(streamChat(input(truncated, () => {}))).rejects.toThrow(/disconnected/);
    const failed = await endpoint((_req, res) => res.end(`${JSON.stringify({ error: 'model not found' })}\n`));
    await expect(streamChat(input(failed, () => {}))).rejects.toThrow('model not found');
  });

  it('stops an active stream when cancelled and reports a stalled endpoint timeout', async () => {
    const url = await endpoint((_req, res) => { res.write(`${JSON.stringify({ message: { content: 'Working' }, done: false })}\n`); });
    const controller = new AbortController();
    await expect(streamChat(input(url, () => controller.abort(), controller.signal))).rejects.toThrow(/cancelled/);
    await expect(streamChat({ ...input(url, () => {}), timeoutMs: 30 })).rejects.toThrow(/timed out/);
  });

  it('does not follow redirects, even to another local endpoint', async () => {
    let contacted = false;
    const destination = await endpoint((_req, res) => { contacted = true; res.end('{}'); });
    const redirect = await endpoint((_req, res) => { res.writeHead(302, { Location: `${destination}/api/chat` }); res.end(); });
    await expect(streamChat(input(redirect, () => {}))).rejects.toThrow();
    expect(contacted).toBe(false);
  });
});
