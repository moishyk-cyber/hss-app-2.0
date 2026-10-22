'use client';
import {createContext, useContext, type ReactNode} from 'react';
import type {CollectionSnapshotData} from './collectionIndex';
const Context=createContext<CollectionSnapshotData|null>(null);
const TotalContext=createContext<number|undefined>(undefined);
const GroupedTableContext=createContext(false);
export function CollectionGroupScope({total,children}:{total:number;children:ReactNode}) {
 return <GroupedTableContext.Provider value={true}><CollectionTotal total={total}>{children}</CollectionTotal></GroupedTableContext.Provider>;
}
/** Grouped tables also display the bounded rows hydrated for each lane. */
export function useTableRecordIds(){
 const snapshot=useContext(Context);
 const grouped=useContext(GroupedTableContext);
 return snapshot && !grouped ? new Set(snapshot.listIds) : null;
}
export function CollectionTotal({total,children}:{total:number;children:ReactNode}) {
 return <TotalContext.Provider value={total}>{children}</TotalContext.Provider>;
}
export function useCollectionTotal(){
 const scoped=useContext(TotalContext);
 const snapshot=useContext(Context);
 return scoped??snapshot?.total;
}
export function CollectionSnapshot({data,children}:{data:CollectionSnapshotData;children:ReactNode}) {
 return <Context.Provider value={data}>{children}</Context.Provider>;
}
export const useCollectionSnapshot=()=>useContext(Context);
export function useLaneTotal(field:string){
 const data=useCollectionSnapshot();
 return (value:string,loaded:number,initialLoaded=loaded)=>
  (data?.laneTotals[field]?.[value]??initialLoaded)+loaded-initialLoaded;
}
