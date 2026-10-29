import { useState } from 'react';
import { ArrowRight, Check, Circle, Plus, Trash2 } from 'lucide-react';
import type { Conversation, DailyItem, Project } from '../../shared/types';
import { dateTime, type Perform } from '../ui';

export default function Daily({ items, conversations, project, perform, openConversation }: { items: DailyItem[]; conversations: Conversation[]; project?: Project; perform: Perform; openConversation: (id: string) => void }) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const done = items.filter(item => item.done).length;
  return <section className="daily-page page-scroll" aria-label="Daily overview">
    <div className="page-intro"><h1>What would make<br />today useful?</h1><p className="daily-date">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</p><p>A little focus. A clear next step. Everything where you left it.</p></div>
    <section className="daily-section"><div className="section-heading"><h2>Your priorities</h2>{items.length > 0 && <span className="quiet-count">{done} of {items.length} done</span>}</div>
      <form className="priority-form" onSubmit={event => { event.preventDefault(); if (!text.trim() || adding) return; setAdding(true); void perform(() => window.jaxos.addDailyItem(text.trim())).then(ok => { if (ok) setText(''); }).finally(() => setAdding(false)); }}><label className="sr-only" htmlFor="new-priority">New priority</label><input id="new-priority" placeholder="Add one thing to move forward…" value={text} onChange={event => setText(event.target.value)} maxLength={1000} /><button className="icon-button" type="submit" aria-label="Add priority" disabled={!text.trim() || adding}><Plus size={20} /></button></form>
      {!items.length ? <p className="empty-inline">Start small. Add the first thing you want to get done.</p> : <ul className="priority-list">{items.map(item => <li key={item.id} className={item.done ? 'done' : ''}><button className="priority-toggle" role="checkbox" aria-checked={item.done} aria-label={`${item.done ? 'Mark incomplete' : 'Complete'}: ${item.text}`} onClick={() => void perform(() => window.jaxos.toggleDailyItem(item.id))}>{item.done ? <Check size={17} /> : <Circle size={19} />}</button><span>{item.text}</span><button className="icon-button subtle delete-priority" aria-label={`Delete priority: ${item.text}`} onClick={() => void perform(() => window.jaxos.removeDailyItem(item.id))}><Trash2 size={15} /></button></li>)}</ul>}
    </section>
    <section className="daily-section"><div className="section-heading"><h2>Pick up where you left off</h2></div>{conversations.length ? <div className="continue-list">{conversations.slice(0, 4).map(conversation => <button key={conversation.id} onClick={() => openConversation(conversation.id)}><span><strong>{conversation.title}</strong><small>{dateTime(conversation.updatedAt)} · {conversation.messages.length} messages</small></span><ArrowRight size={18} /></button>)}</div> : <p className="empty-inline">Your conversations will appear here once you start one.</p>}</section>
    {project?.goal && <section className="daily-section daily-project"><span className="section-label">Current project · {project.name}</span><h2>{project.goal}</h2>{project.notes && <p>{project.notes}</p>}</section>}
  </section>;
}
