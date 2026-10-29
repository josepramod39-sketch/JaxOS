import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, DesktopApi } from '../shared/types';

async function invoke(method: string, ...args: unknown[]) {
  try { return await ipcRenderer.invoke(`jaxos:${method}`, ...args); }
  catch (cause) {
    const message=cause instanceof Error?cause.message:String(cause);
    throw new Error(message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));
  }
}
// Retain an admission key after an uncertain reply; a deliberate retry reconciles it.
const uncertain = new Map<string, string>();
async function admit(method: string, input: { commandId?: string }) {
  if (input.commandId) return invoke(method, input);
  const key = JSON.stringify([method,input]);
  let commandId = uncertain.get(key);
  if (!commandId) {
    if (uncertain.size >= 100) throw new Error('Review interrupted requests before submitting more work.');
    commandId = globalThis.crypto.randomUUID(); uncertain.set(key,commandId);
  }
  const result = await invoke(method,{...input,commandId});
  uncertain.delete(key);
  return result;
}
const api: DesktopApi = {
  getServiceStatus: () => invoke('getServiceStatus'),
  restartService: () => invoke('restartService'),
  onServiceStatus(listener) {
    const handler = (_event: Electron.IpcRendererEvent, status: import('../shared/service-contract').ServiceStatus) => listener(status);
    ipcRenderer.on('jaxos:service-status', handler);
    return () => { ipcRenderer.removeListener('jaxos:service-status', handler); };
  },
  getState: () => invoke('getState'),
  createConversation: id => invoke('createConversation', id),
  selectConversation: id => invoke('selectConversation', id),
  sendMessage: input => admit('sendMessage', input),
  cancelChat: id => invoke('cancelChat', id),
  listModels: () => invoke('listModels'),
  inspectModel: name => invoke('inspectModel', name),
  listLoadedModels: () => invoke('listLoadedModels'),
  startModelOperation: input => admit('startModelOperation', input),
  cancelModelOperation: id => invoke('cancelModelOperation', id),
  saveModelProfile: input => invoke('saveModelProfile', input),
  saveSettings: patch => invoke('saveSettings', patch),
  chooseLlamaFile: kind => invoke('chooseLlamaFile', kind),
  getLlamaStatus: () => invoke('getLlamaStatus'),
  setLlamaSessionKey: key => invoke('setLlamaSessionKey', key),
  setConversationStage: (id, stage) => invoke('setConversationStage', id, stage),
  chooseKiCad: () => invoke('chooseKiCad'),
  getKiCadStatus: () => invoke('getKiCadStatus'),
  chooseProject: () => invoke('chooseProject'),
  selectProject: id => invoke('selectProject', id),
  refreshProject: id => invoke('refreshProject', id),
  updateProject: (id, patch) => invoke('updateProject', id, patch),
  setMode: mode => invoke('setMode', mode),
  addDailyItem: text => invoke('addDailyItem', text),
  toggleDailyItem: id => invoke('toggleDailyItem', id),
  removeDailyItem: id => invoke('removeDailyItem', id),
  startRun: input => admit('startRun', input),
  cancelRun: id => invoke('cancelRun', id),
  readArtifact: input => invoke('readArtifact', input),
  openProjectInKiCad: id => invoke('openProjectInKiCad', id),
  exportRun: id => invoke('exportRun', id),
  openDataFolder: () => invoke('openDataFolder'),
  getStorageInfo: () => invoke('getStorageInfo'),
  searchHistory: input => invoke('searchHistory', input),
  listTasks: input => invoke('listTasks', input),
  listEvents: input => invoke('listEvents', input),
  rebuildHistoryIndex: () => invoke('rebuildHistoryIndex'),
  exportDatabaseBackup: () => invoke('exportDatabaseBackup'),
  windowControl: action => invoke('windowControl', action),
  onState(listener) {
    const handler = (_event: Electron.IpcRendererEvent, state: AppState) => listener(state);
    ipcRenderer.on('jaxos:state', handler);
    return () => ipcRenderer.removeListener('jaxos:state', handler);
  },
};
contextBridge.exposeInMainWorld('jaxos', api);
