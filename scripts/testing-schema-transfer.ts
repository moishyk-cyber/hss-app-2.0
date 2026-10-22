/** One-time, resumable QA transfer. plan/copy are non-destructive; finish verifies before removal. */
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import {PrismaClient,Prisma} from '@prisma/client';
import {randomBytes,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {readFileSync,writeFileSync,mkdirSync,existsSync,chmodSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {planTestTransfer,tableInsertOrder,rowKey,type TransferRows,type TransferRelation} from '../src/lib/testDataTransfer';

const schema='testing',role='hss_testing',dir='qa-reports/testing-transfer';
const archiveFile=`${dir}/archive.json.gz`,reportFile=`${dir}/report.json`;
const tables=Prisma.dmmf.datamodel.models.map(model=>model.name);
const quote=(s:string)=>`"${s.replaceAll('"','""')}"`;
type ForeignKey=TransferRelation & {name:string;definition:string};
type Archive={at:string;sourceRef:string;rows:TransferRows;move:Record<string,string[]>;foreignKeys:ForeignKey[];conflicts:string[];isolatedSchemas:string[];sourceSettings:Record<string,string>;hash:string};
const resolver=new dns.Resolver({timeout:3000,tries:2});resolver.setServers(['1.1.1.1','8.8.8.8']);
async function reachable(raw:string){const url=new URL(raw);url.hostname=(await resolver.resolve4(url.hostname))[0];return url.toString();}
function secretFile(path:string,value:string){writeFileSync(path,value,{mode:0o600});chmodSync(path,0o600);}
function hash(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function readArchive():Archive{return JSON.parse(gunzipSync(readFileSync(archiveFile)).toString());}
function report(extra:Record<string,unknown>){const previous=existsSync(reportFile)?JSON.parse(readFileSync(reportFile,'utf8')):{};const result={...previous,...extra,updatedAt:new Date().toISOString()};writeFileSync(reportFile,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(extra));}
function testSetting(row:Record<string,unknown>){
 if(row.key==='delivery.carriers'||row.key==='delivery.truckers')return {...row,value:JSON.stringify((JSON.parse(String(row.value)) as string[]).filter(name=>name.startsWith('[LOAD TEST]')))};
 return row;
}
function expectedRows(a:Archive,table:string){return a.rows[table].map(row=>{
 if(table==='AppSetting')return testSetting(row);
 if(table==='NotificationEmail')return {...row,status:'skipped',leaseUntil:null,attemptToken:null,lastError:'moved_historical_test_email_not_sent'};
 return row;
});}
async function snapshot(db:PrismaClient){
 assert.ok(!existsSync(archiveFile),'An archive already exists; use copy or finish without replacing it.');
 const manifest=JSON.parse(readFileSync('qa-reports/app-stress-manifest.json','utf8'));
 const notifications=JSON.parse(readFileSync('qa-reports/notification-stress-manifest.json','utf8'));
 const a=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const rows:TransferRows={};
  for(const table of tables)rows[table]=(await tx.$queryRawUnsafe<{row:Record<string,unknown>}[]>(`SELECT to_jsonb(t) AS row FROM public.${quote(table)} t ORDER BY ${quote(table==='AppSetting'||table==='NotificationState'?'key':'id')}`)).map(result=>result.row);
  const foreignKeys=await tx.$queryRawUnsafe<ForeignKey[]>(`SELECT c.relname AS "table",p.relname AS parent,a.attname AS "column",pa.attname AS "parentColumn",co.conname AS name,pg_get_constraintdef(co.oid) AS definition FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class p ON p.oid=co.confrelid JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=co.conkey[1] JOIN pg_attribute pa ON pa.attrelid=p.oid AND pa.attnum=co.confkey[1] WHERE co.contype='f' AND n.nspname='public' AND c.relname = ANY($1::text[])`,tables);
  assert.ok(foreignKeys.every(fk=>tables.includes(fk.parent)),'An app table references an unsupported external table.');
  const plan=planTestTransfer(rows,foreignKeys,[manifest.run,notifications.run]);
  const isolatedSchemas:string[]=[];
  assert.match(notifications.schema,/^hss_qa_[a-z0-9_]+$/);
  const found=await tx.$queryRawUnsafe<{found:boolean}[]>('SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name=$1) AS found',notifications.schema);
  if(found[0].found){
   isolatedSchemas.push(notifications.schema);
   for(const table of ['User','AppSetting','Notification','NotificationEmail']){
    const isolated=await tx.$queryRawUnsafe<{row:Record<string,unknown>}[]>(`SELECT to_jsonb(t) AS row FROM ${quote(notifications.schema)}.${quote(table)} t`);
    for(const {row}of isolated){const existing=plan.copied[table].find(candidate=>rowKey(candidate)===rowKey(row));if(!existing)plan.copied[table].push(row);}
   }
  }
  return {at:new Date().toISOString(),sourceRef:new URL(process.env.SUPABASE_URL!).hostname.split('.')[0],rows:plan.copied,move:plan.move,foreignKeys,conflicts:plan.conflicts,isolatedSchemas,sourceSettings:Object.fromEntries(rows.AppSetting.filter(row=>row.key==='delivery.carriers'||row.key==='delivery.truckers').map(row=>[String(row.key),String(row.value)])),hash:''};
 },{isolationLevel:'RepeatableRead',timeout:120000,maxWait:10000});
 a.hash=hash({...a,hash:''});
 mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
 writeFileSync(archiveFile,gzipSync(JSON.stringify(a)),{mode:0o600});
 report({phase:'planned',schema,archiveSha256:hash(readFileSync(archiveFile).toString('base64')),copied:Object.fromEntries(Object.entries(a.rows).map(([table,rows])=>[table,rows.length])),toMove:Object.fromEntries(Object.entries(a.move).map(([table,ids])=>[table,ids.length])),conflicts:a.conflicts,productionRemoved:false});
 assert.equal(a.conflicts.length,0,'Real work depends on a test root. Review conflicts before continuing.');
}
function testCredentials(){
 const previous=existsSync('.env.testing')?readFileSync('.env.testing','utf8').match(/^TEST_DATABASE_URL=(.*)$/m):null;
 if(previous){const url=new URL(JSON.parse(previous[1]));return {password:decodeURIComponent(url.password),url:url.toString()};}
 const password=randomBytes(32).toString('hex');const url=new URL(process.env.DATABASE_URL!);
 url.username=`${role}.${new URL(process.env.SUPABASE_URL!).hostname.split('.')[0]}`;url.password=password;url.searchParams.set('schema',schema);url.searchParams.set('connection_limit','5');url.searchParams.set('pool_timeout','30');return {password,url:url.toString()};
}
async function verify(db:PrismaClient,a:Archive){
 const checks:Record<string,number>={};
 for(const table of tables){
  const primary=table==='AppSetting'||table==='NotificationState'?'key':'id';
  const actual=await db.$queryRawUnsafe<{row:Record<string,unknown>}[]>(`SELECT to_jsonb(t) AS row FROM testing.${quote(table)} t ORDER BY ${quote(primary)}`);
  const expected=expectedRows(a,table).sort((x,y)=>String(x[primary]).localeCompare(String(y[primary]),'en'));
  const byKey=new Map(actual.map(({row})=>[rowKey(row),row]));
  assert.equal(actual.length,expected.length,`${table} row count differs`);
  for(const row of expected)assert.deepEqual(byKey.get(rowKey(row)),row,`${table} differs for ${rowKey(row)}`);
  checks[table]=actual.length;
 }
 return checks;
}
async function files(a:Archive){
 const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 assert.ok(key && process.env.SUPABASE_URL,'Storage credentials required');
 const storage=createClient(process.env.SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false}}).storage;
 const {data:buckets,error:listError}=await storage.listBuckets();if(listError)throw listError;
 if(!buckets.some(bucket=>bucket.id==='order-files-testing')){const {error}=await storage.createBucket('order-files-testing',{public:false,fileSizeLimit:20971520});if(error)throw error;}
 const copied=[];
 for(const path of [...new Set(a.rows.Document.filter(row=>row.source==='upload'&&row.storagePath).map(row=>String(row.storagePath)))]){
  const source=await storage.from('order-files').download(path);if(source.error)throw source.error;
  const bytes=Buffer.from(await source.data.arrayBuffer());
  const uploaded=await storage.from('order-files-testing').upload(path,bytes,{upsert:true,contentType:source.data.type});if(uploaded.error)throw uploaded.error;
  const destination=await storage.from('order-files-testing').download(path);if(destination.error)throw destination.error;
  assert.equal(hash(Buffer.from(await destination.data.arrayBuffer()).toString('base64')),hash(bytes.toString('base64')),'Upload verification failed');
  secretFile(`${dir}/upload-${copied.length}.base64`,bytes.toString('base64'));
  copied.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
 }
 secretFile(`${dir}/files.json`,JSON.stringify(copied,null,2)+'\n');return copied.length;
}
async function copy(db:PrismaClient,a:Archive){
 assert.equal(a.conflicts.length,0);
 const credentials=testCredentials();
 await db.$transaction(async tx=>{
  const exists=await tx.$queryRawUnsafe<{found:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hss_testing') AS found`);
  if(!exists[0].found)await tx.$executeRawUnsafe(`CREATE ROLE hss_testing LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 8 PASSWORD '${credentials.password}'`);
  else assert.ok(existsSync('.env.testing'),'An unmanaged testing role already exists; refusing to change its password.');
  await tx.$executeRawUnsafe('ALTER ROLE hss_testing SET search_path TO testing,pg_catalog');
  await tx.$executeRawUnsafe("ALTER ROLE hss_testing SET statement_timeout TO '20s'");
  await tx.$executeRawUnsafe("ALTER ROLE hss_testing SET lock_timeout TO '5s'");
  const found=await tx.$queryRawUnsafe<{found:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name='testing') AS found`);
  assert.equal(found[0].found,false,'Testing schema already exists; use verify or finish.');
  await tx.$executeRawUnsafe('CREATE SCHEMA testing');
  await tx.$executeRawUnsafe('REVOKE ALL ON SCHEMA testing FROM PUBLIC,anon,authenticated,service_role');
  await tx.$executeRawUnsafe('GRANT USAGE ON SCHEMA testing TO hss_testing');
  for(const table of tables){
   await tx.$executeRawUnsafe(`CREATE TABLE testing.${quote(table)} (LIKE public.${quote(table)} INCLUDING ALL)`);
   await tx.$executeRawUnsafe(`REVOKE ALL ON testing.${quote(table)} FROM PUBLIC,anon,authenticated,service_role`);
   await tx.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON testing.${quote(table)} TO hss_testing`);
   await tx.$executeRawUnsafe(`ALTER TABLE testing.${quote(table)} ENABLE ROW LEVEL SECURITY`);
   await tx.$executeRawUnsafe(`CREATE POLICY testing_access ON testing.${quote(table)} TO hss_testing USING (true) WITH CHECK (true)`);
  }
  for(const table of tableInsertOrder(tables,a.foreignKeys)){
   const rows=expectedRows(a,table);
   if(table==='AppSetting'||table==='NotificationEmail'){
    for(let i=0;i<rows.length;i+=2000)await tx.$executeRawUnsafe(`INSERT INTO testing.${quote(table)} SELECT * FROM jsonb_populate_recordset(NULL::testing.${quote(table)},$1::jsonb)`,JSON.stringify(rows.slice(i,i+2000)));
   }else{
    const primary=table==='NotificationState'?'key':'id';
    // Both schemas live in the same database: transfer rows on the server,
    // rather than sending the large item payload back across the network.
    for(let i=0;i<rows.length;i+=2000)await tx.$executeRawUnsafe(`INSERT INTO testing.${quote(table)} SELECT * FROM public.${quote(table)} WHERE ${quote(primary)} IN (SELECT jsonb_array_elements_text($1::jsonb))`,JSON.stringify(rows.slice(i,i+2000).map(rowKey)));
    const inserted=await tx.$queryRawUnsafe<{id:string}[]>(`SELECT ${quote(primary)} AS id FROM testing.${quote(table)}`);
    const keys=new Set(inserted.map(row=>row.id));const isolated=rows.filter(row=>!keys.has(rowKey(row)));
    if(isolated.length)await tx.$executeRawUnsafe(`INSERT INTO testing.${quote(table)} SELECT * FROM jsonb_populate_recordset(NULL::testing.${quote(table)},$1::jsonb)`,JSON.stringify(isolated));
   }
   console.log(JSON.stringify({copiedTable:table,rows:rows.length}));
  }
  for(const fk of a.foreignKeys){
   const definition=fk.definition.replace(/REFERENCES (?:public\.)?(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_]*)/,`REFERENCES testing.${quote(fk.parent)}`);
   assert.ok(definition.includes(`REFERENCES testing.${quote(fk.parent)}`));
   await tx.$executeRawUnsafe(`ALTER TABLE testing.${quote(fk.table)} ADD CONSTRAINT ${quote(fk.name)} ${definition}`);
  }
  const exposure=await tx.$queryRawUnsafe<{name:string}[]>(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND has_table_privilege('hss_testing',c.oid,'SELECT,INSERT,UPDATE,DELETE')`);
  assert.equal(exposure.length,0,'Testing login can access production tables');
 },{timeout:600000,maxWait:10000});
 const env:Record<string,string>={MODE:'dev',DATABASE_URL:credentials.url,DIRECT_URL:credentials.url,TEST_DATABASE_URL:credentials.url,TEST_DIRECT_URL:credentials.url,DEV_SESSION_SECRET:randomBytes(32).toString('hex'),CRON_SECRET:randomBytes(32).toString('hex'),NOTIFICATION_EMAIL_ENABLED:'true',APP_URL:'http://127.0.0.1:3001'};
 for(const key of ['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','ANTHROPIC_API_KEY','ANTHROPIC_TERMS_MODEL','RESEND_API_KEY','NOTIFICATION_EMAIL_FROM'])if(process.env[key])env[key]=process.env[key]!;
 secretFile('.env.testing',Object.entries(env).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n');
 const fileCount=await files(a);const verified=await verify(db,a);
 const testing=new PrismaClient({datasourceUrl:await reachable(credentials.url)});
 try{assert.equal(await testing.order.count(),a.rows.Order.length);await assert.rejects(testing.$queryRawUnsafe('SELECT id FROM public."Order" LIMIT 1'));}finally{await testing.$disconnect();}
 report({phase:'copied_and_verified',verified,uploadsCopied:fileCount,restrictedLoginVerified:true,productionRemoved:false});
}
async function syncCredentials(db:Prisma.TransactionClient){
 await db.$executeRawUnsafe(`CREATE FUNCTION testing.sync_identity_from_production() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN IF pg_trigger_depth()>1 THEN RETURN NEW; END IF; IF TG_OP='DELETE' THEN UPDATE testing."User" SET active=false,"passwordHash"=NULL WHERE id=OLD.id; RETURN OLD; END IF; INSERT INTO testing."User" (id,name,email,role,active,"passwordHash","createdAt") VALUES(NEW.id,NEW.name,NEW.email,NEW.role,NEW.active,NEW."passwordHash",NEW."createdAt") ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,"passwordHash"=EXCLUDED."passwordHash",active=EXCLUDED.active; RETURN NEW; END $$`);
 await db.$executeRawUnsafe(`CREATE FUNCTION testing.sync_credentials_to_production() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN IF pg_trigger_depth()>1 THEN RETURN NEW; END IF; UPDATE public."User" SET name=NEW.name,email=NEW.email,"passwordHash"=NEW."passwordHash" WHERE id=NEW.id AND (name,email,"passwordHash") IS DISTINCT FROM (NEW.name,NEW.email,NEW."passwordHash"); RETURN NEW; END $$`);
 await db.$executeRawUnsafe('REVOKE ALL ON FUNCTION testing.sync_identity_from_production() FROM PUBLIC,anon,authenticated,service_role,hss_testing');
 await db.$executeRawUnsafe('REVOKE ALL ON FUNCTION testing.sync_credentials_to_production() FROM PUBLIC,anon,authenticated,service_role,hss_testing');
 await db.$executeRawUnsafe('CREATE TRIGGER hss_testing_identity_sync AFTER INSERT OR UPDATE OR DELETE ON public."User" FOR EACH ROW EXECUTE FUNCTION testing.sync_identity_from_production()');
 await db.$executeRawUnsafe('CREATE TRIGGER hss_testing_credentials_sync AFTER UPDATE OF name,email,"passwordHash" ON testing."User" FOR EACH ROW EXECUTE FUNCTION testing.sync_credentials_to_production()');
}
async function finish(db:PrismaClient,a:Archive){
 await verify(db,a);await files(a);
 const before:Record<string,unknown>={},after:Record<string,unknown>={};
 const fingerprint=async(tx:Prisma.TransactionClient,table:string)=>{
  const primary=table==='AppSetting'||table==='NotificationState'?'key':'id';
  return (await tx.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,chr(10) ORDER BY ${quote(primary)}),'')) AS hash FROM public.${quote(table)} t WHERE ${quote(primary)} NOT IN (SELECT jsonb_array_elements_text($1::jsonb))`,JSON.stringify(a.move[table])) as unknown[])[0];
 };
 await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout='5s'");
  for(const table of tables){
   if(table!=='AppSetting')before[table]=await fingerprint(tx,table);
   const ids=a.move[table];if(!ids.length)continue;
   const primary=table==='NotificationState'?'key':'id';
   const current=await tx.$queryRawUnsafe<{row:Record<string,unknown>}[]>(`SELECT to_jsonb(t) AS row FROM public.${quote(table)} t WHERE ${quote(primary)} IN (SELECT jsonb_array_elements_text($1::jsonb)) FOR UPDATE`,JSON.stringify(ids));
   assert.equal(current.length,ids.length,`${table} source count changed since archive`);
   const archived=new Map(a.rows[table].map(row=>[rowKey(row),row]));
   for(const {row}of current)assert.deepEqual(row,archived.get(rowKey(row)),`${table} was edited after the snapshot. Refresh the transfer plan.`);
  }
  // Check for any new foreign-key dependents created since the archive.
  for(const fk of a.foreignKeys){
   const parents=a.move[fk.parent];if(!parents.length)continue;
   const primary=fk.table==='NotificationState'?'key':'id';
   const outside=await tx.$queryRawUnsafe<{count:number}[]>(`SELECT count(*)::int AS count FROM public.${quote(fk.table)} WHERE ${quote(fk.column)} IN (SELECT jsonb_array_elements_text($1::jsonb)) AND ${quote(primary)} NOT IN (SELECT jsonb_array_elements_text($2::jsonb))`,JSON.stringify(parents),JSON.stringify(a.move[fk.table]));
   assert.equal(outside[0].count,0,`Unmoved ${fk.table} depends on a test record`);
  }
  // Self-referencing task children may be in arbitrary ID order.
  await tx.$executeRawUnsafe('UPDATE public."Task" SET "parentTaskId"=NULL WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))',JSON.stringify(a.move.Task));
  for(const table of tableInsertOrder(tables,a.foreignKeys).reverse()){
   const ids=a.move[table];if(!ids.length)continue;
   const primary=table==='NotificationState'?'key':'id';
   const count=await tx.$executeRawUnsafe(`DELETE FROM public.${quote(table)} WHERE ${quote(primary)} IN (SELECT jsonb_array_elements_text($1::jsonb))`,JSON.stringify(ids));
   // FK cascades can already remove selected children; never touch other records.
   assert.ok(count<=ids.length);
  }
  for(const [key,value]of Object.entries(a.sourceSettings)){
   const current=await tx.appSetting.findUnique({where:{key}});assert.equal(current?.value,value,'Partner list changed during transfer');
   const retained=(JSON.parse(value) as string[]).filter(name=>!name.startsWith('[LOAD TEST]'));
   await tx.appSetting.update({where:{key},data:{value:JSON.stringify(retained)}});
  }
  for(const table of tables)if(table!=='AppSetting'){after[table]=await fingerprint(tx,table);assert.deepEqual(after[table],before[table],`${table} non-test data changed`);}
  for(const isolated of a.isolatedSchemas)await tx.$executeRawUnsafe(`DROP SCHEMA ${quote(isolated)} CASCADE`);
  await syncCredentials(tx);
 },{isolationLevel:'Serializable',timeout:600000,maxWait:10000});
 // Remove only copied objects which no remaining live document references.
 const storage=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}).storage;
 const copiedFiles=JSON.parse(readFileSync(`${dir}/files.json`,'utf8')) as {path:string}[];const retainedUploads:string[]=[];
 for(const {path}of copiedFiles){if(await db.document.count({where:{storagePath:path}})){retainedUploads.push(path);continue;}const {error}=await storage.from('order-files').remove([path]);if(error)retainedUploads.push(path);}
 secretFile(`${dir}/production.env.backup`,readFileSync('.env','utf8'));
 const devEnv=readFileSync('.env.testing','utf8');const testUrl=JSON.parse(devEnv.match(/^TEST_DATABASE_URL=(.*)$/m)![1]);
 let local=readFileSync('.env','utf8');
 for(const [key,value]of Object.entries({MODE:'dev',TEST_DATABASE_URL:testUrl,TEST_APP_URL:'http://127.0.0.1:3001',DEV_SESSION_SECRET:JSON.parse(devEnv.match(/^DEV_SESSION_SECRET=(.*)$/m)![1]),NOTIFICATION_EMAIL_ENABLED:'true'})){
  const line=`${key}=${JSON.stringify(value)}`;const regex=new RegExp(`^${key}=.*$`,'m');local=regex.test(local)?local.replace(regex,()=>line):`${local.trimEnd()}\n${line}\n`;
 }
 secretFile('.env',local);
 report({phase:'complete',productionRemoved:true,nonTestFingerprintsUnchanged:true,identitySynchronization:'name/email/password bidirectional; roles remain environment-specific',retainedSourceUploads:retainedUploads.length,localMode:'dev',normalEmailsEnabled:true,finishedAt:new Date().toISOString()});
}
async function main(){
 const raw=process.env.DATABASE_URL;assert.ok(raw);assert.equal(new URL(raw).searchParams.get('schema')??'public','public','Transfer source must be production/public');
 const db=new PrismaClient({datasourceUrl:await reachable(raw)});
 try{const mode=process.argv[2];if(mode==='plan')await snapshot(db);else{const a=readArchive();assert.equal(a.hash,hash({...a,hash:''}),'Archive checksum mismatch');if(mode==='copy')await copy(db,a);else if(mode==='finish')await finish(db,a);else if(mode==='verify')report({verified:await verify(db,a)});else throw Error('Choose plan, copy, verify or finish');}}finally{await db.$disconnect();}
}
main().catch(error=>{console.error('Testing transfer stopped safely:',error instanceof Error?error.message:'Unknown failure');process.exitCode=1;});
