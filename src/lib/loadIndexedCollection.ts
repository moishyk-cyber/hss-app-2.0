import {collectionSnapshot,type CollectionIndexRow} from './collectionIndex';
import {shareRead} from './shareRead';
/** Keys include model/projection, filters, ownership and SQL ordering. Results are retained only while pending. */
export async function loadIndexedCollection<Row>(key:string, readIndex:()=>Promise<CollectionIndexRow[]>, hydrate:(ids:string[])=>Promise<Row[]>, limit:number,seedFields?:string[]){
 const index=await shareRead(`${key}:index`,readIndex);
 const window=collectionSnapshot(index,limit,seedFields);
 const rows=window.ids.length ? await shareRead(`${key}:rows:${JSON.stringify(window.ids)}`,()=>hydrate(window.ids)) : [];
 return {rows:[...rows],hasMore:window.hasMore,snapshot:window.snapshot};
}
