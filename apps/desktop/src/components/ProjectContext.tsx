import { useEffect, useState } from 'react';
import { Check, ChevronRight, FileCheck2, FolderOpen, ListChecks, PencilLine, RefreshCw, Target } from 'lucide-react';
import type { Project, Run } from '../../shared/types';
import { dateTime, runLabels, statusLabel, type Perform } from '../ui';

interface Props { project?: Project; runs: Run[]; perform: Perform; showTests: () => void; }

export function ProjectBrief({ project, perform }: { project: Project; perform: Perform }) {
  const [goal, setGoal] = useState(project.goal);
  const [notes, setNotes] = useState(project.notes);
  const [checks, setChecks] = useState(project.checks.join('\n'));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setGoal(project.goal); setNotes(project.notes); setChecks(project.checks.join('\n')); }, [project.id, project.goal, project.notes, project.checks.join('\n')]);
  const dirty = goal !== project.goal || notes !== project.notes || checks !== project.checks.join('\n');
  return <form className="project-brief" onSubmit={event => {
    event.preventDefault(); setSaving(true);
    void perform(() => window.jaxos.updateProject(project.id, { goal: goal.trim(), notes: notes.trim(), checks: checks.split('\n').map(value => value.trim()).filter(Boolean) }), 'Project brief saved.').finally(() => setSaving(false));
  }}>
    <label className="field-label" htmlFor="project-goal"><Target size={16} /> Project goal</label>
    <textarea id="project-goal" rows={3} value={goal} onChange={event => setGoal(event.target.value)} placeholder="What are you trying to make?" />
    <label className="field-label" htmlFor="project-notes"><PencilLine size={16} /> Notes and decisions</label>
    <textarea id="project-notes" rows={4} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Keep the decisions worth remembering." />
    <label className="field-label" htmlFor="project-checks"><ListChecks size={16} /> Acceptance checks</label>
    <textarea id="project-checks" rows={3} value={checks} onChange={event => setChecks(event.target.value)} placeholder={'One check per line\nKeep each outcome measurable.'} />
    <p className="field-help">Planning notes. Recorded check results appear in Test.</p>
    <button type="submit" className="button secondary full-width" disabled={!dirty || saving}><Check size={16} />{saving ? 'Saving…' : dirty ? 'Save brief' : 'Brief saved'}</button>
  </form>;
}

export default function ProjectContext({ project, runs, perform, showTests }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const latest = runs.find(run => run.projectId === project?.id && (run.kind === 'erc' || run.kind === 'drc'));
  return <aside className="context-panel" aria-label="Working context">
    <div className="panel-heading"><h2>Working context</h2><FolderOpen size={17} /></div>
    <div className="context-scroll">
      <div className="context-project">
        <span className="section-label">Project</span>
        <div className="project-name"><FolderOpen size={23} /><div><strong>{project?.name ?? 'No project connected'}</strong><span>{project ? 'Local workspace' : 'Choose a KiCad project on your computer'}</span></div></div>
        {project && <p className="project-path" title={project.path}>{project.path}</p>}
        <div className="button-row"><button className="button secondary flex-grow" onClick={() => void perform(() => window.jaxos.chooseProject())}><FolderOpen size={15} />{project ? 'Change project' : 'Open project'}</button>{project && <button className="icon-button border-button" disabled={refreshing} aria-label="Refresh project" title="Refresh project files and check staleness" onClick={() => { setRefreshing(true); void perform(() => window.jaxos.refreshProject(project.id), 'Project refreshed.').finally(() => setRefreshing(false)); }}><RefreshCw size={16} className={refreshing ? 'spinning' : ''} /></button>}</div>
      </div>
      {project ? <ProjectBrief project={project} perform={perform} /> : <div className="context-empty"><Target size={21} /><h3>Give your work a home.</h3><p>Your goal, decisions, and acceptance checks stay with the project.</p></div>}
      <div className="latest-result"><span className="field-label"><FileCheck2 size={16} /> Latest check</span>{latest ? <button className="result-link" onClick={showTests}><span><strong>{runLabels[latest.kind]}</strong><small>{latest.stale ? 'Project changed · check again' : statusLabel(latest)} · {dateTime(latest.createdAt)}</small></span><ChevronRight size={17} /></button> : <p className="muted">No checks run{project ? ' for this project' : ''}.</p>}</div>
    </div>
  </aside>;
}
