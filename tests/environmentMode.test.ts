import test from 'node:test';
import assert from 'node:assert/strict';
import {appMode,databaseConnectionUrl,requireTestDatabase} from '../src/lib/environmentMode';
import {notificationEmailConfig} from '../src/lib/resendEmail';
const prod='postgresql://postgres.ref:password@localhost:5432/postgres';
const testing='postgresql://hss_testing.ref:password@localhost:5432/postgres?schema=testing';
test('MODE defaults to production and switches automatically to restricted testing credentials',()=>{
 assert.equal(appMode({}),'production');assert.equal(databaseConnectionUrl({DATABASE_URL:prod,TEST_DATABASE_URL:testing}),prod);
 assert.equal(databaseConnectionUrl({MODE:'dev',DATABASE_URL:prod,TEST_DATABASE_URL:testing}),testing);
 assert.throws(()=>appMode({MODE:'typo'}),/MODE/);
 assert.throws(()=>databaseConnectionUrl({MODE:'dev',DATABASE_URL:prod}),/TEST_DATABASE_URL/);
 assert.throws(()=>databaseConnectionUrl({MODE:'dev',TEST_DATABASE_URL:prod}),/restricted/);
 assert.throws(()=>databaseConnectionUrl({MODE:'production',DATABASE_URL:testing}),/public/);
});
test('fixture writes require dev mode; dev emails require explicit opt-in and bulk tests always suppress email',()=>{
 assert.throws(()=>requireTestDatabase({DATABASE_URL:prod}),/Production writes are blocked/);
 assert.equal(requireTestDatabase({MODE:'dev',TEST_DATABASE_URL:testing}),testing);
 const email={MODE:'dev',RESEND_API_KEY:'test',NOTIFICATION_EMAIL_FROM:'HSS <notify@example.com>',APP_URL:'https://example.com'};
 assert.equal(notificationEmailConfig(email),null);
 assert.ok(notificationEmailConfig({...email,NOTIFICATION_EMAIL_ENABLED:'true'}));
 assert.equal(notificationEmailConfig({...email,NOTIFICATION_EMAIL_ENABLED:'true',BULK_TEST_MODE:'true'}),null);
});
