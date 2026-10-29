import { build } from 'esbuild';
await build({
  entryPoints: {
    main: 'electron/main.ts', preload: 'electron/preload.ts',
    'service-host': 'electron/service-host.ts', 'llama-host': 'electron/llama-host.ts',
    eval: 'evaluation/cli.ts',
  },
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron'],
  sourcemap: false,
});
