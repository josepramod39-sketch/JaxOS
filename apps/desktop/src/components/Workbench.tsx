import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowUpRight, CheckCircle2, ChevronRight, CircleStop, Clock3, Cpu, FileCode2, FileText, FlaskConical, FolderOpen, Image, Maximize, Play, RefreshCw, TriangleAlert, ZoomIn, ZoomOut } from 'lucide-react';
import type { Artifact, ArtifactContent, KiCadStatus, Project, Run, RunKind } from '../../shared/types';
import { dateTime, fileSize, isRunning, runLabels, statusLabel, type Perform } from '../ui';
import { ProjectBrief } from './ProjectContext';
import Modal from './Modal';

function RunBadge({ run }: { run: Run }) {
  return <span className={`run-badge run-${run.status}`}>{isRunning(run) ? <RefreshCw size={13} className="spinning" /> : run.status === 'passed' ? <CheckCircle2 size={13} /> : run.status === 'failed' || run.status === 'error' ? <AlertCircle size={13} /> : <Clock3 size={13} />}{statusLabel(run)}</span>;
}

function ZoomablePreview({ source, alt }: { source: string; alt: string }) {
  const steps = [.25, .5, .75, 1, 1.5, 2, 3, 4, 6, 8];
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  const viewport = useRef<HTMLDivElement>(null);
  const center = useRef({ x: .5, y: .5 });
  const fit = natural.width && natural.height ? Math.min(available.width / natural.width, available.height / natural.height, 1) : 1;
  const width = Math.max(1, natural.width * fit * zoom);
  const height = Math.max(1, natural.height * fit * zoom);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setAvailable({ width: Math.max(1, element.clientWidth - 36), height: Math.max(1, element.clientHeight - 36) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    element.scrollLeft = center.current.x * element.scrollWidth - element.clientWidth / 2;
    element.scrollTop = center.current.y * element.scrollHeight - element.clientHeight / 2;
  }, [zoom, width, height]);

  function changeZoom(next: number) {
    const element = viewport.current;
    center.current = element && next !== 1 ? {
      x: (element.scrollLeft + element.clientWidth / 2) / element.scrollWidth,
      y: (element.scrollTop + element.clientHeight / 2) / element.scrollHeight,
    } : { x: .5, y: .5 };
    setZoom(next);
  }
  return <>
    <div className="preview-toolbar" role="group" aria-label="Image zoom controls">
      <button className="icon-button" aria-label="Zoom out" disabled={zoom === steps[0]} onClick={() => changeZoom([...steps].reverse().find(step => step < zoom) ?? steps[0])}><ZoomOut size={18} /></button>
      <output className="preview-zoom" aria-label="Preview zoom">{Math.round(zoom * 100)}%</output>
      <button className="icon-button" aria-label="Zoom in" disabled={zoom === steps[steps.length - 1]} onClick={() => changeZoom(steps.find(step => step > zoom) ?? steps[steps.length - 1])}><ZoomIn size={18} /></button>
      <button className="button quiet preview-fit" onClick={() => changeZoom(1)}><Maximize size={15} />Fit preview</button>
      <span className="preview-help">Scroll to inspect details</span>
    </div>
    <div className="artifact-preview image-preview" ref={viewport} role="region" aria-label="Image preview" tabIndex={0}>
      <div className="image-preview-canvas" style={{ width: Math.max(available.width, width), height: Math.max(available.height, height) }}>
        <img className="zoomable-image" alt={alt} src={source} onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} style={natural.width ? { width, height } : undefined} />
      </div>
    </div>
  </>;
}

function ArtifactPreview({ item, onClose }: { item: { artifact: Artifact; content?: ArtifactContent }; onClose: () => void }) {
  const { artifact, content } = item;
  const safeImage = content && ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'].includes(content.mime);
  return <Modal title={artifact.name} onClose={onClose} wide>{safeImage ? <ZoomablePreview source={`data:${content.mime}${content.encoding === 'base64' ? ';base64,' : ','}${content.encoding === 'base64' ? content.content : encodeURIComponent(content.content)}`} alt={`Generated preview: ${artifact.name}`} /> : <div className="artifact-preview">{!content ? <p className="empty-inline" role="status">Loading artifact…</p> : content.encoding === 'utf8' ? <pre>{content.content}</pre> : <div className="empty-state"><FileCode2 size={30} /><h3>File ready to export</h3><p>This file has no inline preview. Use Export run to save it with the evidence.</p></div>}</div>}</Modal>;
}

export function RunDetails({ run, perform }: { run: Run; perform: Perform }) {
  const [preview, setPreview] = useState<{ artifact: Artifact; content?: ArtifactContent }>();
  const [exporting, setExporting] = useState(false);
  return <div className="run-details">
    <div className="run-detail-heading"><div><span className="section-label">{dateTime(run.createdAt)}</span><h2>{runLabels[run.kind]}</h2></div><RunBadge run={run} /></div>
    <p className="run-summary">{run.summary || (isRunning(run) ? 'KiCad is working. Results appear when the command finishes.' : 'No summary available.')}</p>
    {run.error && <div className="inline-alert"><AlertCircle size={17} /><span>{run.error}</span></div>}
    {run.stale && <div className="inline-alert warning"><TriangleAlert size={17} /><span>The project changed after this run. Run the check again to verify the current files.</span></div>}
    {(run.kind === 'erc' || run.kind === 'drc') && <p className="evidence-note">Rule checks verify the design against KiCad rules. They do not verify a physical device.</p>}
    <div className="run-facts"><div><span>KiCad version</span><strong>{run.toolVersion || 'Not reported'}</strong></div><div><span>Exit code</span><strong>{run.exitCode ?? (isRunning(run) ? 'Pending' : 'Not available')}</strong></div><div><span>Project revision</span><code title={run.inputFingerprint}>{run.inputFingerprint.slice(0, 16) || 'Not recorded'}</code></div></div>
    {run.findings.length > 0 && <section className="findings"><h3>Findings <span className="quiet-count">{run.findings.length}</span></h3><ul>{run.findings.map((finding, index) => <li key={`${index}-${finding.rule}`} className={`finding finding-${finding.severity}`}><span className="finding-icon">{finding.severity === 'error' ? <AlertCircle size={17} /> : <TriangleAlert size={17} />}</span><div><strong>{finding.rule || finding.severity}{finding.excluded ? ' · excluded in KiCad' : ''}</strong><p>{finding.message}</p>{finding.location && <small>{finding.location}</small>}</div></li>)}</ul></section>}
    {!!run.artifacts.length && <section className="run-artifacts"><h3>Files <span className="quiet-count">{run.artifacts.length}</span></h3><div className="artifact-list">{run.artifacts.map(artifact => <button key={artifact.id} onClick={() => { setPreview({ artifact }); void perform(async () => { const content = await window.jaxos.readArtifact({ runId: run.id, artifactId: artifact.id }); setPreview({ artifact, content }); }).then(ok => { if (!ok) setPreview(undefined); }); }}>{artifact.mime.startsWith('image/') ? <Image size={19} /> : <FileText size={19} />}<span><strong>{artifact.name}</strong><small>{fileSize(artifact.bytes)}</small></span><ChevronRight size={16} /></button>)}</div></section>}
    <details className="command-details"><summary>Command and output</summary><pre aria-label="Executed command">{run.command.map(part => /\s/.test(part) ? JSON.stringify(part) : part).join(' ') || 'No command recorded.'}</pre><pre className="run-log" aria-label="Command output">{run.log || 'No output recorded.'}</pre></details>
    <div className="run-footer">{isRunning(run) ? <button className="button secondary" onClick={() => void perform(() => window.jaxos.cancelRun(run.id))}><CircleStop size={16} />Cancel run</button> : <button className="button secondary" disabled={exporting} onClick={() => { setExporting(true); void perform(async () => { const path = await window.jaxos.exportRun(run.id); if (path) return path; }).finally(() => setExporting(false)); }}><ArrowDownToLine size={16} />{exporting ? 'Exporting…' : 'Export run'}</button>}<span className="field-help">Evidence stays tied to this project revision.</span></div>
    {preview && <ArtifactPreview item={preview} onClose={() => setPreview(undefined)} />}
  </div>;
}

export default function Workbench({ mode, project, runs, kicad, perform, openSettings }: { mode: 'build' | 'test'; project?: Project; runs: Run[]; kicad?: KiCadStatus; perform: Perform; openSettings: () => void }) {
  const [tab, setTab] = useState<'plan' | 'previews' | 'files'>('plan');
  const [selectedId, setSelectedId] = useState<string>();
  const [starting, setStarting] = useState(false);
  const projectRuns = runs.filter(run => run.projectId === project?.id);
  const testRuns = projectRuns.filter(run => run.kind === 'erc' || run.kind === 'drc');
  const activeRuns = projectRuns.filter(isRunning);
  const busy = starting || activeRuns.length > 0;
  const visibleRuns = mode === 'test' ? testRuns : projectRuns.filter(run => run.kind === (tab === 'previews' ? 'preview' : 'fabrication'));
  const selected = visibleRuns.find(run => run.id === selectedId) ?? visibleRuns[0];
  useEffect(() => { setSelectedId(undefined); setTab('plan'); }, [project?.id]);
  function start(kind: RunKind) {
    if (!project || busy) return;
    setStarting(true);
    if (kind === 'preview') setTab('previews');
    if (kind === 'fabrication') setTab('files');
    void perform(async () => { const run = await window.jaxos.startRun({ projectId: project.id, kind }); setSelectedId(run.id); }).finally(() => setStarting(false));
  }
  if (!project) return <section className="workbench page-scroll"><div className="page-intro"><h1>{mode === 'build' ? 'Bring your project.' : 'Know what was checked.'}</h1><p>{mode === 'build' ? 'Connect a KiCad project to keep its plan, previews, and fabrication files together.' : 'Run electrical and PCB design checks. Keep the findings, commands, and exact revision in one place.'}</p></div><div className="connect-state"><FolderOpen size={36} strokeWidth={1.4} /><h2>A workspace starts with your design.</h2><p>Choose a .kicad_pro file beside its schematic or board. Your original project stays in place.</p><button className="button primary" onClick={() => void perform(() => window.jaxos.chooseProject())}><FolderOpen size={17} />Open project</button></div></section>;
  return <section className="workbench page-scroll" aria-label={mode === 'build' ? 'Build workbench' : 'Test workbench'}>
    <div className="workbench-intro"><div className="workbench-title"><h1>{project.name}</h1><button className="button quiet" onClick={() => void perform(() => window.jaxos.refreshProject(project.id), 'Project refreshed.')} disabled={busy}><RefreshCw size={15} />Refresh</button></div><p className="project-path" title={project.path}>{project.path}</p></div>
    <div className="project-files"><span className={project.schematic ? 'file-connected' : ''}><FileText size={15} />{project.schematic ? 'Schematic connected' : 'No schematic'}</span><span className={project.board ? 'file-connected' : ''}><Cpu size={15} />{project.board ? 'PCB connected' : 'No PCB'}</span></div>
    {!kicad?.available && <div className="tool-prompt"><AlertCircle size={18} /><p>Connect KiCad to run checks and generate project files.</p><button className="text-button" onClick={openSettings}>Set up KiCad<ArrowUpRight size={15} /></button></div>}
    <div className="workbench-actions">{mode === 'build' ? <><button className="button secondary" disabled={!kicad?.available || (!project.schematic && !project.board) || busy} onClick={() => void perform(() => window.jaxos.openProjectInKiCad(project.id))}><ArrowUpRight size={16} />Open in KiCad</button><button className="button secondary" disabled={!kicad?.available || (!project.schematic && !project.board) || busy} onClick={() => start('preview')}><Image size={16} />Generate previews</button><button className="button primary" disabled={!kicad?.available || !project.board || busy} onClick={() => start('fabrication')}><ArrowDownToLine size={16} />Export fabrication</button></> : <><button className="button primary" disabled={!kicad?.available || !project.schematic || busy} onClick={() => start('erc')}><Play size={15} />Run electrical checks</button><button className="button secondary" disabled={!kicad?.available || !project.board || busy} onClick={() => start('drc')}><Play size={15} />Run PCB checks</button></>}</div>
    {busy && <div className="workbench-running" role="status"><RefreshCw size={15} className="spinning" /><span>{activeRuns.length ? `${runLabels[activeRuns[0].kind]} running…` : 'Starting KiCad…'}</span>{activeRuns[0] && <button className="text-button" onClick={() => void perform(() => window.jaxos.cancelRun(activeRuns[0].id))}>Cancel</button>}</div>}
    {mode === 'build' && <div className="workbench-tabs" role="tablist" aria-label="Build views">{(['plan', 'previews', 'files'] as const).map(value => <button role="tab" aria-selected={tab === value} key={value} onClick={() => setTab(value)} className={tab === value ? 'active' : ''}>{value === 'plan' ? <FileText size={16} /> : value === 'previews' ? <Image size={16} /> : <FolderOpen size={16} />}{value === 'plan' ? 'Plan' : value === 'previews' ? 'Previews' : 'Files'}</button>)}</div>}
    {mode === 'build' && tab === 'plan' ? <div className="build-plan"><h2>Define the next milestone.</h2><p className="muted">Keep the goal small and the outcome clear.</p><ProjectBrief project={project} perform={perform} /><div className="build-next"><FlaskConical size={20} /><p>After editing in KiCad, refresh the project and run checks in Test. Generated exports and reports stay in the run history.</p></div></div> : <div className="evidence-area">
      {visibleRuns.length ? <><div className="run-history" aria-label="Run history">{visibleRuns.map(run => <button className={selected?.id === run.id ? 'selected' : ''} key={run.id} onClick={() => setSelectedId(run.id)}><span><strong>{runLabels[run.kind]}</strong><small>{dateTime(run.createdAt)}{run.stale ? ' · Project changed' : ''}</small></span><RunBadge run={run} /></button>)}</div>{selected && <RunDetails run={selected} perform={perform} />}</> : <div className="empty-state">{mode === 'test' ? <FlaskConical size={32} strokeWidth={1.4} /> : tab === 'previews' ? <Image size={32} strokeWidth={1.4} /> : <FolderOpen size={32} strokeWidth={1.4} />}<h2>{mode === 'test' ? 'No checks run yet.' : tab === 'previews' ? 'See what you are building.' : 'Ready when your design is.'}</h2><p>{mode === 'test' ? 'Run an available check above. Findings, tool output, and the checked revision will appear here.' : tab === 'previews' ? 'Generate previews to inspect your schematic and board without leaving the workspace.' : 'Export fabrication files to prepare Gerbers, drill files, and the available manufacturing outputs.'}</p></div>}
    </div>}
  </section>;
}
