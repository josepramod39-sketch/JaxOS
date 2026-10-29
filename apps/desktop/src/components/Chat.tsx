import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, CircleStop, FolderOpen, MessageSquare, Settings2, Sparkles } from 'lucide-react';
import type { Conversation, ModelInfo, Project, Settings, WorkflowStage, ToolStep } from '../../shared/types';
import { STAGES } from '../../shared/provider-settings';
import type { Perform } from '../ui';

interface Props {
  conversation?: Conversation;
  project?: Project;
  settings: Settings;
  models: ModelInfo[];
  perform: Perform;
  openSettings: () => void;
  compact?: boolean;
  revealMessageId?: string;
  revealRequest?: number;
}

const stageHelp:Record<WorkflowStage,string>={analysis:'Inspect project context and identify unknowns.',plan:'Compare options and define acceptance checks.',design:'Discuss a design and generate saved-file previews.',test:'Run electrical and board rule checks when requested.',launch:'Generate a checked fabrication handoff when requested.'};
function ToolReceipt({step,perform}:{step:ToolStep;perform:Perform}){
  let summary=step.result??'Waiting for the operation to finish.';let outcome:string=step.status;
  try{const result=JSON.parse(summary);summary=result.summary??`${result.name??'Project'} inspected. ${result.recentRuns?.length??0} recent results available.`;if(result.status)outcome=`${result.status}${result.stale?' · stale inputs':''}`;}catch{/* A validation or cancellation message is already readable. */}
  return <details className="message-tool"><summary>{step.name==='project_run'?`KiCad ${String(step.arguments.kind).toUpperCase()}`:'Project inspection'} · {outcome}</summary><p>{summary}</p>{step.runId&&<><p className="tool-run-id">Run {step.runId}</p><button type="button" className="text-button" onClick={()=>void perform(()=>window.jaxos.setMode('test'))}>Open Test workbench</button></>}</details>;
}
export default function Chat({ conversation, project, settings, models, perform, openSettings, compact = false, revealMessageId, revealRequest }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const keepBottom = useRef(true);
  const streaming = sending || !!conversation?.messages.some(message => message.status === 'streaming');
  const messageCount = conversation?.messages.length ?? 0;

  useEffect(() => {
    if (keepBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conversation?.messages]);
  useEffect(() => {
    setText('');
    keepBottom.current = true;
  }, [conversation?.id]);
  useEffect(() => {
    if (!revealMessageId) return;
    const message=scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(revealMessageId)}"]`);
    if (message) { keepBottom.current=false; message.scrollIntoView({block:'center'}); }
  }, [conversation?.id,revealMessageId,revealRequest]);

  async function send() {
    const message = text.trim();
    if (!message || streaming || !settings.model) return;
    setSending(true);
    setText('');
    keepBottom.current = true;
    const ok = await perform(async () => {
      const current = conversation ?? await window.jaxos.createConversation(project?.id);
      await window.jaxos.sendMessage({ conversationId: current.id, text: message });
    });
    if (!ok) setText(message);
    setSending(false);
    inputRef.current?.focus();
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  return <section className={`chat ${compact ? 'chat-compact' : ''}`} aria-label={compact ? 'Project assistant' : 'Conversation'}>
    {compact && <div className="panel-heading"><h2>Assistant</h2><MessageSquare size={17} aria-hidden="true" /></div>}
    <div className="chat-scroll" ref={scrollRef} onScroll={() => {
      const element = scrollRef.current;
      if (element) keepBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90;
    }}>
      {!messageCount ? <div className="welcome">
        <div className="welcome-symbol" aria-hidden="true"><Sparkles size={compact ? 25 : 31} strokeWidth={1.6} /></div>
        <h1>{compact ? 'Think it through.' : <>One place to think,<br />build, and verify.</>}</h1>
        <p className="welcome-description">{compact ? 'Talk through the goal, a design decision, or your next check.' : 'Give your ideas a place to grow. Keep the conversation, connect a project, and check what you make.'}</p>
        {!compact && <div className="welcome-steps">
          <button onClick={() => { setText('Help me think through an idea. Ask me about the problem I want to solve.'); inputRef.current?.focus(); }}><div><strong>Explore an idea</strong><small>Start with a question, not a finished plan.</small></div><ArrowUp size={16} className="diagonal-arrow" /></button>
          <button onClick={() => void perform(() => window.jaxos.chooseProject())}><div><strong>Bring in your project</strong><small>Connect an existing KiCad design.</small></div><FolderOpen size={17} /></button>
        </div>}
        {!settings.model && <button className="text-button setup-link" onClick={openSettings}><Settings2 size={16} /> Choose a local model to begin</button>}
      </div> : <div className="message-list" aria-label="Conversation messages">
        {conversation!.messages.map(message => <article data-message-id={message.id} className={`message message-${message.role} ${message.id===revealMessageId?'message-found':''}`} key={message.id}>
          <div className="message-meta"><span className={`avatar ${message.role === 'assistant' ? 'assistant-avatar' : ''}`}>{message.role === 'assistant' ? <Sparkles size={15} /> : 'Y'}</span><strong>{message.role === 'assistant' ? 'JaxOS' : 'You'}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>
          {message.toolSteps?.map(step=><ToolReceipt key={step.id} step={step} perform={perform}/>)}
          {message.reasoning && <details className="message-reasoning"><summary>Reasoning</summary><div>{message.reasoning}</div></details>}
          <div className="message-content">{message.content || (message.status === 'streaming' ? <span className="thinking">{message.phase === 'queued' ? 'Queued for the model' : message.reasoning ? 'Preparing the final answer' : 'Waiting for the model'}<span aria-hidden="true">…</span></span> : <span className="muted">No response received.</span>)}</div>
          {message.finishReason === 'length' && <p className="message-status">Output token limit reached. The answer may be incomplete.</p>}
          {!!message.omittedMessages && <p className="message-status">{message.omittedMessages} older messages were omitted from this request and remain saved locally.</p>}
          {message.usage && <p className="message-status">{message.model}{message.usage.inputTokens !== undefined ? ` · ${message.usage.inputTokens} input tokens` : ''}{message.usage.outputTokens !== undefined ? ` · ${message.usage.outputTokens} output tokens` : ''}{message.usage.generationMs && message.usage.outputTokens ? ` · ${(message.usage.outputTokens * 1000 / message.usage.generationMs).toFixed(1)} tokens/s` : ''}</p>}
          {message.status === 'error' && <p className="message-status error-text">{message.finishReason==='budget_exhausted'?'Task budget reached. Review saved tool results before continuing.':'Response interrupted. Review the message and any tool results before retrying.'}</p>}
          {message.status === 'cancelled' && <p className="message-status">Response stopped.</p>}
        </article>)}
      </div>}
    </div>
    <div className="composer-wrap">
      <div className="workflow-stage"><label htmlFor={compact?'assistant-stage':'chat-stage'}>Workflow stage</label><select id={compact?'assistant-stage':'chat-stage'} value={conversation?.stage??'analysis'} disabled={streaming||!conversation} onChange={event=>conversation&&void perform(()=>window.jaxos.setConversationStage(conversation.id,event.target.value as WorkflowStage))}>{STAGES.map(stage=><option key={stage} value={stage}>{stage[0].toUpperCase()+stage.slice(1)}</option>)}</select></div>
      <p className="workflow-help">{project?stageHelp[conversation?.stage??'analysis']:'Conversation only. Connect a KiCad project to use stage tools.'}</p>
      <form className={`composer ${streaming ? 'composer-busy' : ''}`} onSubmit={event => { event.preventDefault(); void send(); }}>
        <label className="sr-only" htmlFor={compact ? 'assistant-message' : 'chat-message'}>Message JaxOS</label>
        <textarea ref={inputRef} id={compact ? 'assistant-message' : 'chat-message'} value={text} onChange={event => setText(event.target.value)} onKeyDown={onKeyDown} rows={compact ? 3 : 2} placeholder={compact ? 'Think through your project…' : 'What would you like to work on?'} disabled={streaming} />
        <div className="composer-toolbar">
          {models.length ? <><label className="sr-only" htmlFor={compact ? 'assistant-model' : 'chat-model'}>Chat model</label><select id={compact ? 'assistant-model' : 'chat-model'} className="model-select" value={settings.model} disabled={streaming} onChange={event => void perform(() => window.jaxos.saveSettings({ model: event.target.value }))}>
            {!models.some(model => model.name === settings.model) && <option value={settings.model}>{settings.model || 'Choose model'}</option>}
            {models.map(model => <option value={model.name} key={model.name} disabled={model.remote}>{model.name}{model.remote ? ' (remote)' : ''}</option>)}
          </select></> : <button type="button" className="model-button" onClick={openSettings}><span className="status-dot" />{settings.model || 'Set up local model'}</button>}
          {streaming ? <button type="button" className="send-button stop-button" aria-label="Stop response" disabled={!conversation} onClick={() => conversation && void perform(() => window.jaxos.cancelChat(conversation.id))}><CircleStop size={21} /></button> : <button type="submit" className="send-button" aria-label="Send message" disabled={!text.trim() || !settings.model}><ArrowUp size={21} /></button>}
        </div>
      </form>
      <p className="composer-hint">{streaming ? 'Generating a response…' : compact ? 'AI suggestions need your review.' : 'Enter to send · Shift + Enter for a new line'}</p>
    </div>
  </section>;
}
