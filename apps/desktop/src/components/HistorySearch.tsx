import { useEffect, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import type { HistorySearch as SearchResult } from '../../shared/persistence';

export default function HistorySearch({children,onSelect}:{children:ReactNode;onSelect:(conversationId:string,messageId:string)=>void}) {
  const [query,setQuery]=useState('');
  const [result,setResult]=useState<SearchResult>();
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [retry,setRetry]=useState(0);
  const term=query.trim();
  useEffect(()=>{
    let active=true;setResult(undefined);setError('');setLoading(Boolean(term));
    if(!term)return;
    const timer=setTimeout(()=>{
      void window.jaxos.searchHistory({query:term,limit:30}).then(value=>{if(active)setResult(value);}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Search is unavailable. Try again.');}).finally(()=>{if(active)setLoading(false);});
    },180);
    return()=>{active=false;clearTimeout(timer);};
  },[term,retry]);
  return <>
    <div className="history-search-field"><Search size={14} aria-hidden="true"/><label className="sr-only" htmlFor="history-search">Search saved messages</label><input id="history-search" type="search" autoComplete="off" maxLength={300} placeholder="Search messages" value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<button className="icon-button" aria-label="Clear message search" onClick={()=>setQuery('')}><X size={14}/></button>}</div>
    {!term?children:<div className="history-search-results">
      {loading&&<p className="history-search-note" role="status">Searching saved messages…</p>}
      {error&&<div className="history-search-note" role="alert"><p>{error}</p><button className="text-button" onClick={()=>setRetry(value=>value+1)}>Try search again</button></div>}
      {result&&<><p className="history-search-note" role="status">{result.hits.length?`${result.hits.length===30?'First 30':result.hits.length} matching message${result.hits.length===1?'':'s'}`:'No saved messages match.'}{result.engine==='basic'?' · Basic text search':''}</p><nav aria-label="Message search results">{result.hits.map(hit=><button className="history-search-hit" key={hit.conversationId+':'+hit.messageId} onClick={()=>onSelect(hit.conversationId,hit.messageId)}><strong>{hit.title}</strong><span className="history-hit-meta">{hit.role==='user'?'You':'JaxOS'} · {new Date(hit.createdAt).toLocaleDateString()}</span><span className="history-hit-excerpt">{hit.excerpt}</span></button>)}</nav></>}
    </div>}
  </>;
}
