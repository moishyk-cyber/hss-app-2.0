/** Exact QA markers and relational ownership, never a generic search for "test". */
export type TransferRow = Record<string, unknown>;
export type TransferRows = Record<string, TransferRow[]>;
export type TransferRelation = {table:string;column:string;parent:string;parentColumn:string};
const configuration = new Set(['User','AppSetting','FieldRequirement','RolePermission']);
const businessRoots = new Set(['Company','Opportunity','Order','Task','ServiceIssue']);
export function rowKey(row:TransferRow){return String(row.id ?? row.key);}
export function isQaRow(row:TransferRow,runs:string[]){
 const id=rowKey(row);
 return id.startsWith('qa_') || runs.some(run=>id.startsWith(`${run}_`)) ||
  ['title','name','firstName','notes','note'].some(field=>typeof row[field]==='string' && (row[field] as string).startsWith('[LOAD TEST]')) ||
  (typeof row.eventKey==='string' && runs.some(run=>(row.eventKey as string).startsWith(`${run}:`)));
}
export function planTestTransfer(rows:TransferRows,relations:TransferRelation[],runs:string[]){
 const parentIndexes=new Map(relations.map(fk=>[`${fk.parent}.${fk.parentColumn}`,new Map((rows[fk.parent]??[]).map(row=>[row[fk.parentColumn],row]))]));
 const move:Record<string,Set<string>>=Object.fromEntries(Object.keys(rows).map(table=>[table,new Set<string>()]));
 for(const [table,records]of Object.entries(rows))if(!configuration.has(table))for(const row of records)if(isQaRow(row,runs))move[table].add(rowKey(row));
 const conflicts=new Set<string>();
 let changed=true;
 while(changed){
  changed=false;
  const owned=new Set(Object.values(move).flatMap(ids=>[...ids]));
  for(const [table,records]of Object.entries(rows)){
   if(configuration.has(table))continue;
   for(const row of records){
    if(move[table].has(rowKey(row)))continue;
    const fkOwned=relations.some(fk=>fk.table===table && move[fk.parent]?.has(String(row[fk.column])));
    const linked=owned.has(String(row.linkedId)) || owned.has(String(row.resultId));
    const eventOwned=table==='Notification' && typeof row.eventKey==='string' && row.eventKey.split(':').some(part=>owned.has(part));
    const stateOwned=table==='NotificationState' && rowKey(row).split(':').some(part=>owned.has(part));
    if(!(fkOwned||linked||eventOwned||stateOwned))continue;
    if(businessRoots.has(table) && !isQaRow(row,runs)){conflicts.add(`${table}:${rowKey(row)}`);continue;}
    move[table].add(rowKey(row));changed=true;
   }
  }
 }
 const copy:Record<string,Set<string>>=Object.fromEntries(Object.entries(move).map(([table,ids])=>[table,new Set(ids)]));
 // Existing team sign-ins and configuration are copied, never removed from production.
 for(const table of configuration)for(const row of rows[table]??[])copy[table].add(rowKey(row));
 changed=true;
 while(changed){
  changed=false;
  for(const fk of relations)for(const row of rows[fk.table]??[]){
   if(!copy[fk.table].has(rowKey(row)) || row[fk.column]==null)continue;
   const parent=parentIndexes.get(`${fk.parent}.${fk.parentColumn}`)?.get(row[fk.column]);
   if(!parent)throw Error(`Missing dependency for ${fk.table}.${fk.column}`);
   if(!copy[fk.parent].has(rowKey(parent))){copy[fk.parent].add(rowKey(parent));changed=true;}
  }
 }
 const copied=Object.fromEntries(Object.entries(rows).map(([table,records])=>[table,records.filter(row=>copy[table].has(rowKey(row)))]));
 return {move:Object.fromEntries(Object.entries(move).map(([table,ids])=>[table,[...ids]])),copied,conflicts:[...conflicts]};
}
export function tableInsertOrder(tables:string[],relations:TransferRelation[]){
 const pending=new Set(tables);const ordered:string[]=[];
 while(pending.size){
  const ready=[...pending].filter(table=>!relations.some(fk=>fk.table===table && fk.parent!==table && pending.has(fk.parent)));
  if(!ready.length)throw Error('Cyclic table dependencies require an explicit transfer order');
  for(const table of ready){pending.delete(table);ordered.push(table);}
 }
 return ordered;
}
