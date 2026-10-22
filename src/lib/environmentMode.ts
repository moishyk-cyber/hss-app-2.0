export type AppMode = 'dev' | 'production';
export function appMode(env:Record<string,string|undefined>=process.env):AppMode {
 const value=env.MODE?.trim().toLowerCase();
 if(!value || value==='production' || value==='prod')return 'production';
 if(value==='dev')return 'dev';
 throw Error('MODE must be dev or production.');
}
export function databaseConnectionUrl(env:Record<string,string|undefined>=process.env){
 const dev=appMode(env)==='dev';
 const raw=dev?env.TEST_DATABASE_URL:env.DATABASE_URL;
 if(!raw)throw Error(dev?'TEST_DATABASE_URL is required in dev mode.':'DATABASE_URL is required.');
 const url=new URL(raw);
 const schema=url.searchParams.get('schema')??'public';
 if(dev && (schema!=='testing' || !/^hss_testing(?:\.|$)/.test(decodeURIComponent(url.username))))throw Error('Dev mode requires the restricted hss_testing login and testing schema.');
 if(!dev && schema!=='public')throw Error('Production mode must use the public schema.');
 return url.toString();
}
export function requireTestDatabase(env:Record<string,string|undefined>=process.env){
 if(appMode(env)!=='dev')throw Error('Test fixtures and stress tests require MODE=dev. Production writes are blocked.');
 return databaseConnectionUrl(env);
}
