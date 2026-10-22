'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import Link from '@/lib/IntentLink';
import {Spinner} from '@/lib/ui';
import {BallInCourtBadge} from '@/lib/BallInCourtBadge';
import type {MyItemKind,MyItemRow} from '@/lib/myItemsTypes';
export function MyItemsScroll({children,kind,cursor:initialCursor,hasMore:initialMore,title}:{children:ReactNode;kind:MyItemKind;cursor:string;hasMore:boolean;title:string}){
 const root=useRef<HTMLDivElement>(null);const end=useRef<HTMLLIElement>(null);
 const busy=useRef(false);const abort=useRef<AbortController|null>(null);
 const [state,setState]=useState({rows:[] as MyItemRow[],cursor:initialCursor,more:initialMore,loading:false,error:''});
 async function load(){
  if(busy.current||!state.more)return;
  busy.current=true;setState(s=>({...s,loading:true,error:''}));
  const controller=new AbortController();abort.current=controller;
  try{
   const response=await fetch(`/api/dashboard/my-items?${new URLSearchParams({kind,cursor:state.cursor})}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});
   if(!response.ok)throw Error('Could not load more items.');
   const data=await response.json() as {rows:MyItemRow[];cursor:string;hasMore:boolean};
   setState(s=>({...s,rows:[...s.rows,...data.rows.filter(row=>!s.rows.some(existing=>existing.id===row.id))],cursor:data.cursor,more:data.hasMore,loading:false,error:''}));
  }catch{if(!controller.signal.aborted)setState(s=>({...s,loading:false,error:'Could not load more items.'}));}
  finally{busy.current=false;}
 }
 useEffect(()=>()=>abort.current?.abort(),[]);
 useEffect(()=>{
  if(!state.more||state.loading||state.error)return;
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))void load();},{root:root.current,rootMargin:'0px 0px 80px 0px'});
  if(end.current)observer.observe(end.current);
  return()=>observer.disconnect();
 // Each new cursor owns one observer; the request ref prevents duplicate scroll events.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[state.cursor,state.more,state.loading,state.error]);
 return <div ref={root} tabIndex={0} aria-label={title} aria-busy={state.loading} className="max-h-[360px] overflow-y-auto overscroll-contain">
  <ul className="mt-2 divide-y divide-border">{children}{state.rows.map(row=><li key={`loaded:${row.id}`} className="flex items-center justify-between gap-3 py-2 text-sm">
   <Link href={row.href} className="min-w-0 flex-1 truncate text-blue hover:underline">{row.title}</Link>
   <span className={`badge shrink-0 ${row.color}`}>{row.label}</span>
   <span className="flex shrink-0 flex-col items-end gap-1 text-xs">{row.ball&&<BallInCourtBadge ball={row.ball}/>}<span className={row.date?`badge ${row.overdue?"badge-orange":"badge-gray"}`:"text-gray-dark"}>{row.date?`${row.overdue?"Overdue":row.dateLabel} ${new Date(row.date).toLocaleDateString()}`:kind==="pricing"?row.dateLabel:"no date"}</span></span>
  </li>)}<li ref={end} className="min-h-1 list-none">{state.loading&&<span role="status" className="collection-scroll-spinner"><Spinner/><span className="sr-only">Loading more items</span></span>}{state.error&&<div role="alert" className="flex items-center justify-center gap-2 py-3 text-sm">{state.error}<button className="btn btn-sm" onClick={()=>void load()}>Try again</button></div>}</li></ul>
 </div>;
}
