import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray, utilityProcess } from 'electron';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ServiceClient } from './service-client';
import type { RemoteService } from '../shared/service-contract';
import { getKiCadEditorExecutable } from './kicad';
import type { DesktopApi } from '../shared/types';

app.setName('JaxOS');
const isTest = !app.isPackaged && process.env.JAXOS_TEST_MODE === '1';
const dataOverride = isTest ? process.env.JAXOS_DATA_DIR : undefined;
if (dataOverride) app.setPath('userData', path.resolve(dataOverride));

let window: BrowserWindow | null = null;
let service: RemoteService;
let serviceClient: ServiceClient;
let tray: Tray | undefined;
let background = false;
let quitting = false;

function updateBackground(enabled: boolean) {
  background = enabled;
  if (!enabled) { tray?.destroy(); tray = undefined; return; }
  if (tray) return;
  // Authored bitmap geometry for the existing small JaxOS letter mark.
  const bitmap = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const at = (y * 32 + x) * 4;
    const white = (x >= 19 && x <= 23 && y >= 7 && y <= 22) || (x >= 10 && x <= 21 && y >= 22 && y <= 26) || (x >= 7 && x <= 11 && y >= 18 && y <= 23) || (x >= 19 && x <= 23 && y >= 2 && y <= 5);
    bitmap[at] = white ? 255 : 253; bitmap[at + 1] = white ? 255 : 83; bitmap[at + 2] = white ? 255 : 0; bitmap[at + 3] = 255;
  }
  tray = new Tray(nativeImage.createFromBitmap(bitmap, { width: 32, height: 32 }));
  tray.setToolTip('JaxOS — workspace service running');
  const show = () => { window?.show(); window?.focus(); };
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open JaxOS', click: show }, { type: 'separator' }, { label: 'Quit JaxOS', click: () => app.quit() }]));
  tray.on('double-click', show);
}
const builtPage = path.join(__dirname, '..', 'dist', 'index.html');
const devUrl = !app.isPackaged && !isTest ? process.env.VITE_DEV_SERVER_URL : undefined;
if (devUrl && new URL(devUrl).origin !== 'http://127.0.0.1:5173') {
  throw new Error('The development renderer must use the expected loopback origin.');
}

function trusted(event: Electron.IpcMainInvokeEvent) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Untrusted application frame.');
  }
  const url = new URL(event.senderFrame.url);
  const expected = new URL(devUrl || pathToFileURL(builtPage).href);
  if (url.protocol !== expected.protocol || url.host !== expected.host || (!devUrl && url.pathname !== expected.pathname)) {
    throw new Error('Untrusted application page.');
  }
}

function register(name: keyof DesktopApi, handler: (...args: any[]) => unknown) {
  ipcMain.handle(`jaxos:${name}`, (event, ...args: unknown[]) => {
    trusted(event);
    return handler(...args);
  });
}

function registerApi(dataDir: string) {
  register('getServiceStatus', () => serviceClient.getStatus());
  register('restartService', () => serviceClient.restart());
  register('getState', () => service.getState());
  register('getStorageInfo', () => service.getStorageInfo());
  register('searchHistory', input => service.searchHistory(input));
  register('listTasks', input => service.listTasks(input));
  register('listEvents', input => service.listEvents(input));
  register('rebuildHistoryIndex', () => service.rebuildHistoryIndex());
  register('exportDatabaseBackup', async () => {
    let destination: string | undefined;
    if (isTest && process.env.JAXOS_TEST_EXPORT_DIR) destination = path.join(process.env.JAXOS_TEST_EXPORT_DIR, 'jaxos-backup.sqlite');
    else {
      const result = await dialog.showSaveDialog(window!, { title: 'Export database backup', defaultPath: `JaxOS-backup-${new Date().toISOString().slice(0,10)}.sqlite`, filters: [{ name: 'SQLite database', extensions: ['sqlite'] }] });
      if (!result.canceled) destination = result.filePath;
    }
    if (!destination) return null;
    await service.backupDatabase(destination);
    return destination;
  });
  register('createConversation', id => service.createConversation(id));
  register('selectConversation', id => service.selectConversation(id));
  register('sendMessage', input => service.sendMessage(input));
  register('cancelChat', id => service.cancelChat(id));
  register('listModels', () => service.listModels());
  register('inspectModel', name => service.inspectModel(name));
  register('listLoadedModels', () => service.listLoadedModels());
  register('startModelOperation', input => service.startModelOperation(input));
  register('cancelModelOperation', id => service.cancelModelOperation(id));
  register('saveModelProfile', input => service.saveModelProfile(input));
  register('saveSettings', patch => service.saveSettings(patch));
  register('getLlamaStatus', () => service.getLlamaStatus());
  register('setLlamaSessionKey', key => service.setLlamaSessionKey(key));
  register('setConversationStage', (id, stage) => service.setConversationStage(id, stage));
  register('chooseLlamaFile', async kind => {
    if (!['executable','modelPath'].includes(kind)) throw new Error('Unknown llama.cpp file selection.');
    const testFile = isTest ? process.env[kind==='executable'?'JAXOS_TEST_LLAMA_BIN':'JAXOS_TEST_LLAMA_MODEL'] : undefined;
    if (testFile) return service.setLlamaFile(kind,testFile);
    const result=await dialog.showOpenDialog(window!,{title:kind==='executable'?'Choose llama-server executable':'Choose a GGUF model',properties:['openFile'],
      ...(kind==='modelPath'?{filters:[{name:'GGUF model',extensions:['gguf']}]}:process.platform==='win32'?{filters:[{name:'llama-server executable',extensions:['exe']}]}:{})});
    if (!result.canceled && result.filePaths[0]) await service.setLlamaFile(kind,result.filePaths[0]);
  });
  register('getKiCadStatus', () => service.getKiCadStatus());
  register('selectProject', id => service.selectProject(id));
  register('refreshProject', id => service.refreshProject(id));
  register('updateProject', (id, patch) => service.updateProject(id, patch));
  register('setMode', mode => service.setMode(mode));
  register('addDailyItem', text => service.addDailyItem(text));
  register('toggleDailyItem', id => service.toggleDailyItem(id));
  register('removeDailyItem', id => service.removeDailyItem(id));
  register('startRun', input => service.startRun(input));
  register('cancelRun', id => service.cancelRun(id));
  register('readArtifact', input => service.readArtifact(input));

  register('chooseProject', async () => {
    if (isTest && process.env.JAXOS_TEST_PROJECT) return service.importProject(process.env.JAXOS_TEST_PROJECT);
    const result = await dialog.showOpenDialog(window!, {
      title: 'Connect a KiCad project', properties: ['openFile'],
      filters: [{ name: 'KiCad project', extensions: ['kicad_pro'] }],
    });
    return result.canceled || !result.filePaths[0] ? null : service.importProject(result.filePaths[0]);
  });
  register('chooseKiCad', async () => {
    if (isTest && process.env.JAXOS_TEST_KICAD_PATH) {
      await service.setKiCadPath(process.env.JAXOS_TEST_KICAD_PATH);
      return service.getKiCadStatus();
    }
    const result = await dialog.showOpenDialog(window!, {
      title: 'Locate kicad-cli', properties: ['openFile'],
      ...(process.platform === 'win32' ? { filters: [{ name: 'KiCad command-line executable', extensions: ['exe'] }] } : {}),
    });
    if (!result.canceled && result.filePaths[0]) {
      const selected = result.filePaths[0];
      if (!/^kicad-cli(?:\.exe)?$/i.test(path.basename(selected))) throw new Error('Select the kicad-cli executable from your KiCad installation.');
      await service.setKiCadPath(selected);
    }
    return service.getKiCadStatus();
  });
  register('openProjectInKiCad', async id => {
    const project = await service.getProject(id);
    const status = await service.getKiCadStatus();
    if (!status.available) throw new Error(status.error || 'KiCad is not available.');
    const editor = getKiCadEditorExecutable(status.path);
    if (path.isAbsolute(editor)) await access(editor, constants.X_OK);
    const target = project.projectFile || project.path;
    await access(target);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(editor, [target], { detached: true, stdio: 'ignore', shell: false });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
  });
  register('exportRun', async id => {
    const run = await service.getRun(id);
    if (run.status === 'running' || run.status === 'queued') throw new Error('Wait for this run to finish before exporting.');
    if (run.artifacts.length === 0) throw new Error('This run has no files to export.');
    let parent: string | undefined;
    if (isTest && process.env.JAXOS_TEST_EXPORT_DIR) parent = process.env.JAXOS_TEST_EXPORT_DIR;
    else {
      const result = await dialog.showOpenDialog(window!, { title: 'Export run evidence', properties: ['openDirectory', 'createDirectory'] });
      if (result.canceled) return null;
      parent = result.filePaths[0];
    }
    if (!parent) return null;
    const destination = path.join(await realpath(parent), `JaxOS-${run.kind}-${run.id}`);
    const outputRoot = await realpath(path.join(dataDir, 'runs', run.id, 'output'));
    await mkdir(destination, { recursive: false });
    const exportedArtifacts = [];
    for (const artifact of run.artifacts) {
      const source = await service.getArtifactPath(run.id, artifact.id);
      const relative = path.relative(outputRoot, source);
      if (!relative || path.isAbsolute(relative) || relative.split(path.sep).includes('..')) throw new Error('Artifact is outside the run output folder.');
      // Preserve KiCad's relative references, including Gerber job layer filenames
      // and the output paths recorded in the original evidence manifest.
      const exportedPath = path.join('output', relative);
      const target = path.join(destination, exportedPath);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target, constants.COPYFILE_EXCL);
      exportedArtifacts.push({ ...artifact, path: exportedPath.split(path.sep).join('/') });
    }
    await writeFile(path.join(destination, 'run-evidence.json'), JSON.stringify({ ...run, artifacts: exportedArtifacts }, null, 2), { flag: 'wx' });
    return destination;
  });
  register('openDataFolder', async () => {
    const error = await shell.openPath(dataDir);
    if (error) throw new Error(error);
  });
  register('windowControl', action => {
    if (action === 'minimize') window?.minimize();
    else if (action === 'maximize') window?.isMaximized() ? window.unmaximize() : window?.maximize();
    else if (action === 'close') window?.close();
    else throw new Error('Unknown window action.');
  });
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 740, minHeight: 560,
    title: 'JaxOS', backgroundColor: '#f8faff', frame: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: true },
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.on('closed', () => { window = null; });
  window.on('close', event => { if (background && !quitting) { event.preventDefault(); window?.hide(); } });
  window.once('ready-to-show', () => window?.show());
  if (devUrl) await window.loadURL(devUrl);
  else await window.loadFile(builtPage);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
  app.whenReady().then(async () => {
    const dataDir = path.join(app.getPath('userData'), 'workspace');
    await mkdir(dataDir, { recursive: true });
    serviceClient = new ServiceClient(() => {
      const child = utilityProcess.fork(path.join(__dirname, 'service-host.cjs'), [dataDir], { serviceName: 'JaxOS workspace coordinator', stdio: 'pipe', env: { ...process.env, JAXOS_SERVICE_PARENT_PID: String(process.pid) } });
      child.stderr?.on('data', chunk => process.stderr.write(chunk));
      return { send: request => child.postMessage(request), onMessage: callback => { child.on('message', callback); }, onExit: callback => { child.on('exit', callback); }, kill: () => { child.kill(); } };
    });
    await serviceClient.start();
    service = serviceClient.remote;
    updateBackground(Boolean((await service.getState()).settings.runInBackground));
    registerApi(dataDir);
    serviceClient.subscribe(state => { updateBackground(Boolean(state.settings.runInBackground)); if (window && !window.isDestroyed()) window.webContents.send('jaxos:state', state); });
    serviceClient.onStatus(status => { if (window && !window.isDestroyed()) window.webContents.send('jaxos:service-status', status); });
    await createWindow();
    app.on('activate', () => { if (!window) void createWindow(); });
  }).catch(error => {
    dialog.showErrorBox('JaxOS could not start', error instanceof Error ? error.message : String(error));
    app.exit(1);
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', event => {
    if (quitting || !service) return;
    event.preventDefault();
    quitting = true;
    Promise.resolve(serviceClient.stop()).finally(() => app.quit());
  });
}
