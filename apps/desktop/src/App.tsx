import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CalendarDays, Check, ChevronRight, Code2, FlaskConical, FolderOpen, Lightbulb, LoaderCircle, Menu, MessageSquare, Minus, PanelRight, Plus, Settings2, Square, X } from 'lucide-react';
import type { AppState, KiCadStatus, ModelInfo, Mode } from '../shared/types';
import type { ServiceStatus } from '../shared/service-contract';
import Chat from './components/Chat';
import Daily from './components/Daily';
import ProjectContext from './components/ProjectContext';
import Settings from './components/Settings';
import Workbench from './components/Workbench';
import HistorySearch from './components/HistorySearch';
import type { Perform } from './ui';

const modes = [
  { id: 'brainstorm', label: 'Brainstorm', icon: Lightbulb },
  { id: 'daily', label: 'Daily', icon: CalendarDays },
  { id: 'build', label: 'Build', icon: Code2 },
  { id: 'test', label: 'Test', icon: FlaskConical },
] as const;

class RenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="boot-screen"><AlertCircle size={32} /><h1>The workspace could not be displayed.</h1><p>Your saved data stays in the application data folder.</p><button className="button primary" onClick={() => location.reload()}>Reload workspace</button></div>;
    return this.props.children;
  }
}

function Workspace() {
  const [state, setState] = useState<AppState>();
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>();
  const [bootError, setBootError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [kicad, setKiCad] = useState<KiCadStatus>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [revealMessageId,setRevealMessageId]=useState<string>();
  const [revealRequest,setRevealRequest]=useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [newBusy, setNewBusy] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const perform: Perform = useCallback(async (operation, success) => {
    setError('');
    try {
      await operation();
      if (success) {
        setNotice(success);
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(''), 5000);
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  }, []);
  const refreshModels = useCallback(async () => { setModels(await window.jaxos.listModels()); }, []);
  const refreshKiCad = useCallback(async () => { setKiCad(await window.jaxos.getKiCadStatus()); }, []);

  useEffect(() => {
    if (!window.jaxos) { setBootError('Open JaxOS from the desktop application to connect to your local workspace.'); return; }
    let active = true;
    const unsubscribe = window.jaxos.onState(next => { if (active) setState(next); });
    const unsubscribeStatus = window.jaxos.onServiceStatus(next => { if (active) setServiceStatus(next); });
    void window.jaxos.getServiceStatus().then(next => { if (active) setServiceStatus(next); }).catch(() => {});
    void window.jaxos.getState().then(next => { if (active) setState(next); }).catch(cause => { if (active) setBootError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; unsubscribe(); unsubscribeStatus(); if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, []);

  useEffect(() => {
    if (!serviceStatus?.connected) return;
    let active = true;
    void window.jaxos.listModels().then(next => { if (active) setModels(next); }).catch(() => { if (active) setModels([]); });
    void window.jaxos.getKiCadStatus().then(next => { if (active) setKiCad(next); }).catch(cause => { if (active) setKiCad({ available: false, path: '', error: cause instanceof Error ? cause.message : String(cause) }); });
    return () => { active = false; };
  }, [serviceStatus?.connected,state?.settings.provider,state?.settings.ollamaUrl,state?.settings.llama?.mode,state?.settings.llama?.url,state?.settings.llama?.modelPath]);

  const newConversation = useCallback(async () => {
    if (newBusy) return;
    setNewBusy(true);
    const ok = await perform(async () => { await window.jaxos.createConversation(state?.activeProjectId); await window.jaxos.setMode('brainstorm'); });
    if (ok) { setSidebarOpen(false); setSidePanelOpen(false); }
    setNewBusy(false);
  }, [newBusy, perform, state?.activeProjectId]);
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n' && !settingsOpen) { event.preventDefault(); void newConversation(); }
      if (event.key === 'Escape') { setSidebarOpen(false); setSidePanelOpen(false); }
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [newConversation, settingsOpen]);

  if (!state) return <div className="boot-screen"><div className="brand-mark large">j</div>{bootError ? <><h1>Let’s reconnect your workspace.</h1><p role="alert">{bootError}</p><button className="button primary" onClick={() => location.reload()}>Try again</button></> : <><LoaderCircle size={25} className="spinning" /><p>Opening your workspace…</p></>}</div>;
  const project = state.projects.find(item => item.id === state.activeProjectId);
  const conversation = state.conversations.find(item => item.id === state.activeConversationId);
  const workbench = state.mode === 'build' || state.mode === 'test';
  const conversations = [...state.conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const runs = [...state.runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const activeRuns = runs.filter(run => run.status === 'running' || run.status === 'queued');

  function changeMode(mode: Mode) { void perform(() => window.jaxos.setMode(mode)); setSidebarOpen(false); setSidePanelOpen(false); }
  function openConversation(id: string, messageId?: string) { setRevealMessageId(messageId);setRevealRequest(value=>value+1); void perform(async () => { await window.jaxos.selectConversation(id); await window.jaxos.setMode('brainstorm'); }); setSidebarOpen(false); }

  return <div className={`app-shell mode-${state.mode}`}>
    <header className="titlebar"><div className="titlebar-brand"><span className="brand-mark">j</span><strong>JaxOS</strong><span className="titlebar-divider" /><span className="titlebar-caption">Your local workspace</span></div><div className="window-controls"><button aria-label="Minimize window" onClick={() => void perform(() => window.jaxos.windowControl('minimize'))}><Minus size={15} /></button><button aria-label="Maximize window" onClick={() => void perform(() => window.jaxos.windowControl('maximize'))}><Square size={12} /></button><button aria-label="Close window" className="window-close" onClick={() => void perform(() => window.jaxos.windowControl('close'))}><X size={17} /></button></div></header>
    <div className="app-body">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="Main navigation">
        <button className="button primary new-conversation" onClick={() => void newConversation()} disabled={newBusy}><Plus size={19} /><span>New conversation</span><kbd>Ctrl N</kbd></button>
        <nav className="primary-navigation"><button className={state.mode === 'daily' ? 'active' : ''} onClick={() => changeMode('daily')}><CalendarDays size={19} /><span>Today</span>{state.dailyItems.some(item => !item.done) && <span className="nav-count">{state.dailyItems.filter(item => !item.done).length}</span>}</button><button onClick={() => void perform(() => window.jaxos.chooseProject())}><FolderOpen size={19} /><span>Connect project</span><Plus size={14} className="nav-tail" /></button></nav>
        {!!state.projects.length && <div className="sidebar-projects"><div className="sidebar-label">Projects</div>{state.projects.map(item => <button key={item.id} className={`project-nav-item ${item.id === project?.id ? 'selected' : ''}`} onClick={() => { void perform(() => window.jaxos.selectProject(item.id)); setSidebarOpen(false); }} title={item.path}><FolderOpen size={17} /><span>{item.name}</span>{item.id === project?.id && <span className="status-dot ready" />}</button>)}</div>}
        <div className="sidebar-history"><div className="sidebar-label">Conversations <span>{conversations.length || ''}</span></div><HistorySearch onSelect={openConversation}>{conversations.length ? <nav className="conversation-navigation" aria-label="Recent conversations">{conversations.map(item => <button key={item.id} title={item.title} className={item.id === conversation?.id ? 'selected' : ''} onClick={() => openConversation(item.id)}><MessageSquare size={16} /><span>{item.title}</span>{item.messages.some(message => message.status === 'streaming') && <span className="status-dot generating" />}</button>)}</nav> : <p className="history-empty">A fresh start.<br />Your conversations will live here.</p>}</HistorySearch></div>
        <div className="sidebar-bottom"><button onClick={() => { setSettingsOpen(true); setSidebarOpen(false); }}><Settings2 size={18} /><span>Settings</span><ChevronRight size={15} /></button><div className="local-footnote"><span className="status-dot" />Saved on this computer</div></div>
      </aside>
      <main className="main-workspace">
        <header className="workspace-header"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><div className="workspace-heading"><span>{state.mode === 'daily' ? 'Today' : workbench ? (project?.name ?? 'Your workspace') : (conversation?.title ?? 'A little room to think')}</span>{workbench && <small>Local project</small>}</div><nav className="mode-navigation" aria-label="Workspace modes">{modes.map(item => <button key={item.id} className={state.mode === item.id ? 'active' : ''} aria-current={state.mode === item.id ? 'page' : undefined} onClick={() => changeMode(item.id)}><item.icon size={18} /><span>{item.label}</span></button>)}</nav><button className={`icon-button panel-toggle ${sidePanelOpen ? 'active' : ''}`} aria-label={workbench ? 'Toggle assistant panel' : 'Toggle working context'} aria-expanded={sidePanelOpen} onClick={() => setSidePanelOpen(!sidePanelOpen)}><PanelRight size={19} /></button></header>
        {serviceStatus && !serviceStatus.connected && <div className="app-alert" role="alert"><AlertCircle size={17} /><span>{serviceStatus.message}</span><button className="button secondary" onClick={() => void perform(async () => { setState(await window.jaxos.restartService()); setError(''); })}>Reconnect service</button></div>}
        {(error || state.notice) && <div className="app-alert" role="alert"><AlertCircle size={17} /><span>{error || state.notice}</span>{error && <button className="icon-button" onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button>}</div>}
        {notice && <div className="success-notice" role="status"><Check size={15} /><span>{notice}</span><button className="icon-button" onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={14} /></button></div>}
        <div className="workspace-content">
          <div className="primary-pane">{state.mode === 'brainstorm' ? <Chat revealRequest={revealRequest} revealMessageId={revealMessageId} conversation={conversation} project={project} settings={state.settings} models={models} perform={perform} openSettings={() => setSettingsOpen(true)} /> : state.mode === 'daily' ? <Daily items={state.dailyItems} conversations={conversations} project={project} perform={perform} openConversation={openConversation} /> : <Workbench mode={state.mode} project={project} runs={runs} kicad={kicad} perform={perform} openSettings={() => setSettingsOpen(true)} />}</div>
          {sidePanelOpen && <button className="side-panel-backdrop" aria-label="Close side panel" onClick={() => setSidePanelOpen(false)} />}
          <div className={`secondary-pane ${sidePanelOpen ? 'is-open' : ''}`}><button className="icon-button close-side-panel" aria-label="Close side panel" onClick={() => setSidePanelOpen(false)}><X size={18} /></button>{workbench ? <Chat revealRequest={revealRequest} revealMessageId={revealMessageId} conversation={conversation} project={project} settings={state.settings} models={models} perform={perform} openSettings={() => setSettingsOpen(true)} compact /> : <ProjectContext project={project} runs={runs} perform={perform} showTests={() => changeMode('test')} />}</div>
        </div>
      </main>
    </div>
    <footer className="statusbar"><span><span className={`status-dot ${activeRuns.length ? 'generating' : ''}`} />{activeRuns.length ? `${activeRuns.length} active run${activeRuns.length === 1 ? '' : 's'}` : 'Local workspace'}</span><span className="statusbar-project"><FolderOpen size={13} />{project?.name ?? 'No project connected'}</span><span className="statusbar-model">{state.settings.model || 'No model selected'}</span><span className="version">v0.5.1</span></footer>
    {settingsOpen && <Settings settings={state.settings} models={models} kicad={kicad} operations={state.modelOperations ?? []} generating={state.conversations.some(item => item.messages.some(message => message.status === 'streaming'))} perform={perform} refreshModels={refreshModels} refreshKiCad={refreshKiCad} onClose={() => setSettingsOpen(false)} />}
  </div>;
}

export default function App() { return <RenderBoundary><Workspace /></RenderBoundary>; }
