import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadsConfigured } from '../src/lib/storage';

test('storage supports modern secrets, legacy fallback, and missing/blank-key detection', () => {
  const original = { url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY, legacy: process.env.SUPABASE_SERVICE_ROLE_KEY };
  try {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(uploadsConfigured(), true);
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy-test-key';
    assert.equal(uploadsConfigured(), true);
    process.env.SUPABASE_SECRET_KEY = '   ';
    assert.equal(uploadsConfigured(), true);
    process.env.SUPABASE_SERVICE_ROLE_KEY = '   ';
    assert.equal(uploadsConfigured(), false);
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
    delete process.env.SUPABASE_URL;
    assert.equal(uploadsConfigured(), false);
  } finally {
    for (const [key, value] of Object.entries({ SUPABASE_URL: original.url, SUPABASE_SECRET_KEY: original.secret, SUPABASE_SERVICE_ROLE_KEY: original.legacy })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
