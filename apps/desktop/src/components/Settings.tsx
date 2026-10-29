import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FolderOpen, RefreshCw, Settings2, Square } from 'lucide-react';
import type { InferenceProfile, KiCadStatus, LoadedModel, ModelDetails, ModelInfo, ModelOperation, Settings as AppSettings, ProviderKind, LlamaConfig, LlamaStatus } from '../../shared/types';
import type { StorageInfo } from '../../shared/persistence';
import { llamaConfig, LLAMA_MODEL, providerKind } from '../../shared/provider-settings';
import { getModelProfile } from '../../shared/model-profile';
import type { Perform } from '../ui';
import { fileSize } from '../ui';
import Modal from './Modal';

interface Props {
  settings: AppSettings; models: ModelInfo[]; kicad?: KiCadStatus; operations: ModelOperation[]; generating: boolean;
  perform: Perform; refreshModels: () => Promise<void>; refreshKiCad: () => Promise<void>; onClose: () => void;
}
export default function Settings({ settings, models, kicad, operations, generating, perform, refreshModels, refreshKiCad, onClose }: Props) {
  const [provider,setProvider]=useState<ProviderKind>(providerKind(settings));
  const [llama,setLlama]=useState<LlamaConfig>(()=>llamaConfig(settings));
  const [llamaStatus,setLlamaStatus]=useState<LlamaStatus>();
  const [sessionKey,setSessionKey]=useState('');
  const [keyEdited,setKeyEdited]=useState(false);
  const runtimeRequest=useRef(0);
  const [capabilityRevision,setCapabilityRevision]=useState(0);
  const runtimeKey=JSON.stringify([settings.provider,settings.ollamaUrl,settings.llama]);
  const managed=provider==='llamacpp' && llama.mode==='managed';
  const lifecycle=provider==='ollama'||managed;
  const [url, setUrl] = useState(settings.ollamaUrl);
  const [model, setModel] = useState(settings.model);
  const [busy, setBusy] = useState(false);
  const [connectionNote, setConnectionNote] = useState('');
  const [localError, setLocalError] = useState('');
  const [details, setDetails] = useState<ModelDetails>();
  const [detailsError, setDetailsError] = useState('');
  const [loaded, setLoaded] = useState<LoadedModel[]>();
  const [runtimeError, setRuntimeError] = useState('');
  const [download, setDownload] = useState('');
  const [background, setBackground] = useState(Boolean(settings.runInBackground));
  const [storage,setStorage]=useState<StorageInfo>();
  const [storageError,setStorageError]=useState('');
  const [backupNote,setBackupNote]=useState('');
  const selected = managed ? LLAMA_MODEL : model.trim();
  const installed = models.some(item => item.name === selected);
  const [profile, setProfile] = useState<InferenceProfile>(() => getModelProfile(settings));
  const savedProfile = JSON.stringify(getModelProfile(settings, selected));
  const operation = operations.find(item=>(item.provider??'ollama')===provider);
  const operating = operations.some(item => item.status === 'running');
  const resident = loaded?.find(item => item.name === selected);
  const llamaOptions=({mode,url,gpuLayers,threads}:LlamaConfig)=>({mode,url:url.trim().replace(/\/$/,''),gpuLayers,threads});
  const connectedSettings = provider===providerKind(settings) && (provider==='ollama' ? url.trim().replace(/\/$/, '')===settings.ollamaUrl : JSON.stringify(llamaOptions(llama))===JSON.stringify(llamaOptions(llamaConfig(settings))));
  useEffect(()=>{setProvider(providerKind(settings));setModel(settings.model);setUrl(settings.ollamaUrl);setLlama(llamaConfig(settings));},[runtimeKey,settings.model]);
  async function saveConnection(){
    await window.jaxos.saveSettings({provider,model:selected,...(provider==='ollama'?{ollamaUrl:url.trim()}:{llama:llamaOptions(llama)})});
    if(provider==='llamacpp' && llama.mode==='external' && keyEdited){await window.jaxos.setLlamaSessionKey(sessionKey);setSessionKey('');setKeyEdited(false);}
    await refreshModels();await refreshRuntime();setCapabilityRevision(value=>value+1);
    setConnectionNote(managed?'GGUF configuration saved. Load the selected model when ready.':'Connection saved. Choose a model reported by this runtime.');
  }
  async function chooseFile(kind:'executable'|'modelPath'){
    await window.jaxos.saveSettings({provider:'llamacpp',llama:llamaOptions(llama)});
    await window.jaxos.chooseLlamaFile(kind);await refreshModels();await refreshRuntime();
  }

  useEffect(() => { setProfile(JSON.parse(savedProfile)); }, [savedProfile, selected, runtimeKey]);
  useEffect(() => { setBackground(Boolean(settings.runInBackground)); }, [settings.runInBackground]);
  useEffect(()=>{let active=true;void window.jaxos.getStorageInfo().then(value=>{if(active)setStorage(value);}).catch(cause=>{if(active)setStorageError(cause instanceof Error?cause.message:'Storage status is unavailable.');});return()=>{active=false;};},[]);
  useEffect(() => {
    let active = true; setDetails(undefined); setDetailsError('');
    if (installed && connectedSettings) void window.jaxos.inspectModel(selected).then(value => { if (active) setDetails(value); }).catch(error => { if (active) setDetailsError(error instanceof Error ? error.message : 'Model details are unavailable.'); });
    return () => { active = false; };
  }, [installed, selected, runtimeKey, connectedSettings, operation?.status, capabilityRevision]);
  async function refreshRuntime() {
    const request=++runtimeRequest.current;
    try { const [status,value]=await Promise.all([window.jaxos.getLlamaStatus(),window.jaxos.listLoadedModels()]); if(request!==runtimeRequest.current)return;setLlamaStatus(status);setLoaded(value);setRuntimeError(''); }
    catch (error) { if(request!==runtimeRequest.current)return;setLoaded(undefined); setRuntimeError(error instanceof Error ? error.message : 'Runtime status is unavailable.'); }
  }
  useEffect(() => { void refreshRuntime(); }, [runtimeKey, operation?.id, operation?.status]);
  useEffect(() => { if (operation?.status === 'complete' && operation.kind === 'pull') void refreshModels().catch(() => {}); }, [operation?.id, operation?.status, refreshModels]);

  async function run(action: () => Promise<unknown>, success?: string) {
    setLocalError(''); setBusy(true);
    try { return await perform(async () => { try { await action(); } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); throw error; } }, success); }
    finally { setBusy(false); }
  }
  function change<K extends keyof InferenceProfile>(key: K, value: InferenceProfile[K]) { setProfile(current => ({ ...current, [key]: value })); }
  const locked = busy || operating || !connectedSettings;
  return <Modal title="Settings" onClose={onClose}>
    <div className="settings-body">
      {localError && <div className="inline-alert" role="alert">{localError}</div>}
      <section className="settings-section">
        <div className="settings-section-heading"><Settings2 size={20} /><div><h3>Local assistant</h3><p>Choose local weights and manage their inference profile.</p></div></div>
        <form onSubmit={event => { event.preventDefault(); void run(saveConnection); }}>
          <label className="field-label" htmlFor="model-provider">Model runtime</label><select id="model-provider" value={provider} disabled={busy||operating||generating} onChange={event=>{const next=event.target.value as ProviderKind;setProvider(next);setModel(settings.providerModels?.[next]??(next==='ollama'?'qwen3:0.6b':LLAMA_MODEL));setConnectionNote('');setSessionKey('');}}><option value="ollama">Ollama</option><option value="llamacpp">llama.cpp</option></select>
          {provider==='ollama'?<><label className="field-label" htmlFor="ollama-url">Ollama address</label><input id="ollama-url" type="url" required value={url} onChange={event => { setUrl(event.target.value); setConnectionNote(''); }} placeholder="http://127.0.0.1:11434" /><p className="field-help">Start Ollama on this computer. JaxOS connects to its local service.</p></>:<>
            <label className="field-label" htmlFor="llama-mode">llama.cpp connection</label><select id="llama-mode" value={llama.mode} disabled={busy||operating||generating} onChange={event=>{const mode=event.target.value as LlamaConfig['mode'];setLlama(current=>({...current,mode}));setConnectionNote('');}}><option value="managed">Manage a local GGUF model</option><option value="external">Attach to a running server</option></select>
            {managed?<><p className="field-help">Choose your installed llama-server executable and GGUF weights. JaxOS loads the model locally and releases its process when you unload or quit.</p>
              <div className="runtime-files"><div><strong>Server executable</strong><p className="code-path">{settings.llama?.executable??'No server selected'}</p><button type="button" className="button secondary" disabled={busy||operating||generating} onClick={()=>void run(()=>chooseFile('executable'))}><FolderOpen size={15}/>Choose llama-server</button></div><div><strong>Model weights</strong><p className="code-path">{settings.llama?.modelPath??'No GGUF selected'}</p><button type="button" className="button secondary" disabled={busy||operating||generating} onClick={()=>void run(()=>chooseFile('modelPath'))}><FolderOpen size={15}/>Choose GGUF model</button></div></div>
              <details className="runtime-options"><summary>Processor settings <span>{llama.gpuLayers===0?'CPU only':llama.gpuLayers===-1?'Automatic GPU placement':`${llama.gpuLayers} GPU layers`} · {llama.threads} threads</span></summary><div className="profile-fields"><div><label className="field-label" htmlFor="llama-gpu">GPU layers</label><input id="llama-gpu" disabled={busy||operating||generating} type="number" min={-1} max={999} step={1} required value={llama.gpuLayers} onChange={event=>{const gpuLayers=Number(event.target.value);setLlama(current=>({...current,gpuLayers}));}}/></div><div><label className="field-label" htmlFor="llama-threads">CPU threads</label><input id="llama-threads" disabled={busy||operating||generating} type="number" min={1} max={256} step={1} required value={llama.threads} onChange={event=>{const threads=Number(event.target.value);setLlama(current=>({...current,threads}));}}/></div></div><p className="field-help">GPU layers: −1 lets the runtime choose, 0 uses CPU, a positive number requests that many layers. Your server build and hardware determine support. Saving runtime changes unloads the current model.</p></details>
            </>:<><label className="field-label" htmlFor="llama-url">llama.cpp address</label><input id="llama-url" type="url" required value={llama.url} onChange={event=>{const url=event.target.value;setLlama(current=>({...current,url}));}} placeholder="http://127.0.0.1:8080"/><label className="field-label" htmlFor="llama-key">Session API key (optional)</label><input id="llama-key" type="password" autoComplete="off" value={sessionKey} onChange={event=>{setSessionKey(event.target.value);setKeyEdited(true);}}/><p className="field-help">Keys stay in memory until the service stops or the connection changes. Loading, GPU placement and context allocation belong to your server.</p></>}
          </>}
          {!managed&&<><label className="field-label" htmlFor="settings-model">Model name</label><input id="settings-model" list="installed-models" value={model} onChange={event => setModel(event.target.value)} placeholder={provider==='ollama'?'For example, qwen3:0.6b':'Use the model ID reported by your server'} /><datalist id="installed-models">{models.map(item => <option value={item.name} key={item.name} />)}</datalist></>}
          <div className="settings-actions"><button className="button primary" disabled={busy} type="submit">{busy ? 'Working…' : 'Save and connect'}</button><button className="button quiet" type="button" disabled={busy} onClick={() => void run(async () => { await refreshModels(); await refreshRuntime(); setCapabilityRevision(value=>value+1); }, 'Model status refreshed.')}><RefreshCw size={15} />Refresh models</button></div>
          {connectionNote && <p className="inline-success" role="status"><CheckCircle2 size={15} />{connectionNote}</p>}
        </form>

        <div className="model-runtime" aria-label="Selected model status">
          <strong>{!connectedSettings?'Save the runtime configuration':details ? details.local ? 'Local model' : 'Remote route — choose local weights' : installed ? 'Reading model capabilities…' : 'Choose an installed model'}</strong>
          {details && <p>{[details.parameterSize, details.quantization, details.maxContext ? `${details.maxContext.toLocaleString()} advertised context` : 'Context limit not reported', details.thinking ? 'Thinking supported' : 'No thinking capability reported'].filter(Boolean).join(' · ')}</p>}
          {detailsError && <p>{detailsError}</p>}
          <p>{!connectedSettings?'Model status refers to the saved connection.':loaded ? resident ? `Loaded · ${fileSize(resident.size)} ${provider==='llamacpp'?'model file':'resident'} · ${resident.vram===undefined?'VRAM not reported':`${fileSize(resident.vram)} reported VRAM`}${resident.contextTokens ? ` · ${resident.contextTokens.toLocaleString()} effective context` : ''}` : 'Not currently loaded' : runtimeError || 'Checking runtime status…'}</p>
          <div className="settings-actions"><button className="button secondary" disabled={locked || generating || !details?.local || !lifecycle || (managed&&!settings.llama?.executable)} onClick={() => void run(() => window.jaxos.startModelOperation({ model: selected, kind: 'load' }))}>Load model</button><button className="button quiet" disabled={locked || generating || !resident || !lifecycle} onClick={() => void run(() => window.jaxos.startModelOperation({ model: selected, kind: 'unload' }))}>Unload model</button></div>
          {!lifecycle&&<p>Start and stop this model in your attached server.</p>}
          {managed&&llamaStatus&&<p>{llamaStatus.message}{llamaStatus.running&&llamaStatus.gpuLayers!==undefined?` Requested GPU layers: ${llamaStatus.gpuLayers===-1?'Auto':llamaStatus.gpuLayers}.`:''}</p>}
          {managed&&llamaStatus?.version&&<details className="runtime-version"><summary>Runtime version</summary><p>{llamaStatus.version}</p></details>}
          {details?.ready===false&&<p>Load the GGUF to inspect thinking and tool support.</p>}
          {generating && <p>Stop active and queued responses before loading or unloading.</p>}
          {!connectedSettings && <p>Save the connection before managing models.</p>}
        </div>

        <details className="settings-disclosure">
          <summary>Generation profile <span>{profile.contextTokens.toLocaleString()} context · Thinking {profile.thinking}</span></summary>
          <form onSubmit={event => { event.preventDefault(); void run(() => window.jaxos.saveModelProfile({ model: selected, profile:provider==='llamacpp'?{...profile,gpu:'auto'}:profile }), 'Model profile saved.'); }}>
            <div className="profile-fields"><div><label className="field-label" htmlFor="context-tokens">Context tokens</label><input id="context-tokens" type="number" min={512} max={Math.min(details?.maxContext ?? 131072, (!lifecycle?details?.effectiveContext:undefined)??131072, 131072)} step={1} required value={profile.contextTokens} onChange={event => change('contextTokens', Number(event.target.value))} /></div><div><label className="field-label" htmlFor="output-tokens">Maximum output tokens</label><input id="output-tokens" type="number" min={128} max={Math.min(16384, profile.contextTokens - 256)} step={1} required value={profile.outputTokens} onChange={event => change('outputTokens', Number(event.target.value))} /></div></div>
            <label className="field-label" htmlFor="thinking-mode">Thinking</label><select id="thinking-mode" value={profile.thinking} onChange={event => change('thinking', event.target.value as InferenceProfile['thinking'])}><option value="off">Off</option><option value="auto">Model default</option><option value="on" disabled={!details?.thinking}>On</option></select>
            <p className="field-help">Reasoning appears separately from the final answer. Output tokens also bound generation work.</p>
            <div className="profile-fields"><div><label className="field-label" htmlFor="model-temperature">Temperature</label><input id="model-temperature" type="number" min={0} max={2} step={.05} required value={profile.temperature} onChange={event => change('temperature', Number(event.target.value))} /></div><div><label className="field-label" htmlFor="model-keepalive">Keep loaded</label><select id="model-keepalive" disabled={!lifecycle} value={profile.keepAliveSeconds} onChange={event => change('keepAliveSeconds', Number(event.target.value))}>{![0, 60, 300, 900, 3600, -1].includes(profile.keepAliveSeconds) && <option value={profile.keepAliveSeconds}>{profile.keepAliveSeconds} seconds</option>}<option value={0}>Unload after response</option><option value={60}>1 minute</option><option value={300}>5 minutes</option><option value={900}>15 minutes</option><option value={3600}>1 hour</option><option value={-1}>Keep loaded</option></select></div></div>
            {provider==='ollama'&&<><label className="field-label" htmlFor="model-processor">Processor policy</label><select id="model-processor" value={profile.gpu} onChange={event => change('gpu', event.target.value as InferenceProfile['gpu'])}><option value="auto">Automatic CPU / GPU placement</option><option value="cpu">CPU only</option></select></>}
            <p className="field-help">{managed?'Context changes reload the GGUF on the next load or message. GPU placement uses the layers above.':provider==='ollama'?'Context and processor changes can reload the model.':'Context cannot exceed the attached server allocation. Keep-loaded and GPU controls belong to that server.'} Larger contexts need more memory. Profiles are saved for this provider and model.</p>
            <div className="settings-actions"><button className="button primary" disabled={locked || !details?.local} type="submit">Save model profile</button></div>
          </form>
        </details>
        {provider==='ollama'&&<details className="settings-disclosure"><summary>Download a model</summary><form onSubmit={event => { event.preventDefault(); void run(() => window.jaxos.startModelOperation({ model: download.trim(), kind: 'pull' })); }}><label className="field-label" htmlFor="download-model">Model to download</label><input id="download-model" required value={download} onChange={event => setDownload(event.target.value)} placeholder="For example, qwen3:0.6b" /><p className="field-help">Ollama downloads the weights to its model storage. Unloading keeps these files.</p><div className="settings-actions"><button className="button secondary" disabled={locked || !download.trim()}><Download size={15} />Download model</button></div></form></details>}
        {operation && <div className={`model-operation ${operation.status === 'error' ? 'error-text' : ''}`} role={operation.status === 'error' ? 'alert' : 'status'}><strong>{operation.model} · {operation.kind} · {operation.status}</strong><p>{operation.summary}</p>{operation.status === 'running' && operation.total && operation.completed !== undefined ? <progress aria-label="Model download progress" value={operation.completed} max={operation.total} /> : null}{operation.status === 'running' && <button className="button quiet" disabled={busy} onClick={() => void run(() => window.jaxos.cancelModelOperation(operation.id))}><Square size={12} />Cancel request</button>}</div>}
      </section>
      <section className="settings-section"><div className="settings-section-heading"><FolderOpen size={20} /><div><h3>KiCad tools</h3><p>Run checks and generate files from your connected project.</p></div></div>
        <div className="tool-status"><span className={`status-dot ${kicad?.available ? 'ready' : 'unavailable'}`} /><strong>{kicad?.available ? `KiCad ${kicad.version ?? ''}` : 'KiCad CLI not connected'}</strong></div>
        {kicad?.path && <p className="code-path">{kicad.path}</p>}{kicad?.error && <p className="field-help">{kicad.error}</p>}
        <p className="field-help">Choose <code>kicad-cli.exe</code> from your KiCad installation for saved-file checks and exports.</p>
        <div className="settings-actions"><button className="button secondary" disabled={busy} onClick={() => void run(async () => { await window.jaxos.chooseKiCad(); await refreshKiCad(); })}><FolderOpen size={16} />Choose KiCad CLI</button><button className="button quiet" disabled={busy} onClick={() => void run(refreshKiCad)}><RefreshCw size={15} />Detect again</button></div>
      </section>
      <section className="settings-section data-settings"><h3>Your workspace</h3><p>Conversations, profiles, project notes and run evidence are stored locally by the workspace service.</p>
        {storage&&<div className="storage-status"><strong>SQLite {storage.sqliteVersion}</strong><span>{storage.search==='fts5'?'Full-text message search':'Basic text search'}</span>{storage.importedFrom&&<span>Imported from {storage.importedFrom}. Original JSON files were kept.</span>}</div>}
        {storageError&&<p className="error-text" role="alert">{storageError}</p>}
        <div className="settings-actions"><button className="button secondary" disabled={busy} onClick={()=>void run(async()=>{const destination=await window.jaxos.exportDatabaseBackup();if(destination)setBackupNote('Database backup exported. Project sources and run artifact files stay in their original folders.');})}><Download size={15}/>Export database backup</button><button className="button quiet" disabled={busy} onClick={()=>void run(async()=>{setStorage(await window.jaxos.rebuildHistoryIndex());setBackupNote('Message search index rebuilt from saved history.');})}><RefreshCw size={15}/>Rebuild search index</button></div>
        <p>Backups contain history, settings and task records. Copy the runs folder separately to preserve artifact files; your KiCad source projects stay in their own folders.</p>{backupNote&&<p role="status">{backupNote}</p>}<label className="background-preference"><input type="checkbox" checked={background} disabled={busy} onChange={event => { const checked = event.target.checked; setBackground(checked); void run(() => window.jaxos.saveSettings({ runInBackground: checked })).then(ok => { if (!ok) setBackground(Boolean(settings.runInBackground)); }); }} /><span>Keep working in the tray when the window closes</span></label><p>Use Quit JaxOS in the tray to stop the service and save. Closing the window does not keep the PC awake.</p><button className="button secondary" onClick={() => void run(() => window.jaxos.openDataFolder())}><FolderOpen size={16} />Open data folder</button></section>
    </div>
  </Modal>;
}
