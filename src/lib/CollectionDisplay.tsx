"use client";
import { type ReactNode, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ToolbarIcon } from "./ToolbarIcon";
import { Spinner } from "./ui";

/** A display change uses the existing snapshot. Filters and sorting still navigate to the server. */
export function CollectionView({ view, defaultView = "kanban", forceList = false, children }: {
  view: "list" | "kanban"; defaultView?: "list" | "kanban"; forceList?: boolean; children: ReactNode;
}) {
  const params=useSearchParams();
  const active=forceList?"list":params.get("view")??defaultView;
  return active===view?children:null;
}

export function CollectionViewToggle({ defaultView="kanban", forceList=false }: {defaultView?:"list"|"kanban";forceList?:boolean}) {
 const params=useSearchParams();const router=useRouter();const [pending,startTransition]=useTransition();
 const active=forceList?"list":params.get("view")??defaultView;
 function change(view:"list"|"kanban"){
  if(active===view)return;
  const url=new URL(window.location.href);url.searchParams.set("view",view);
  if(forceList&&view==="kanban"){
   for(const key of ["scope","f_stage","records","page"])url.searchParams.delete(key);
   startTransition(()=>router.push(`${url.pathname}${url.search}`,{scroll:false}));
  }else window.history.pushState(null,"",`${url.pathname}${url.search}${url.hash}`);
 }
 return <div className="flex items-center gap-1.5" role="group" aria-label="Collection view">
  {(["list","kanban"] as const).map(view=><button key={view} type="button" className={`chip ${active===view?"chip-active":""}`} aria-label={view==="list"?"Table view":"Kanban view"} data-view-tooltip={view==="list"?"Table view — Records in rows and columns":"Kanban view — Records grouped into columns"} aria-pressed={active===view} disabled={pending} onClick={()=>change(view)}>
   {pending?<Spinner/>:<ToolbarIcon name={view==="list"?"table":"kanban"}/>}<span className="sr-only">{view==="list"?"Table":"Kanban"}</span>
  </button>)}
 </div>;
}
