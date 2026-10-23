import { createClient } from '@supabase/supabase-js';
import { UPLOAD_MIME_TYPES } from '../src/lib/uploadPolicy';

// Explicit bucket only; preserve privacy, size limits, and existing allowed types.
const bucket = process.argv[2];
if (!['order-files-testing', 'order-files'].includes(bucket)) throw new Error('Specify order-files-testing or order-files.');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!process.env.SUPABASE_URL || !key) throw new Error('Storage credentials are not configured.');
const client = createClient(process.env.SUPABASE_URL, key, { auth: { persistSession: false } });
async function main() {
  const { data, error } = await client.storage.getBucket(bucket);
  if (error || !data) throw new Error(error?.message ?? 'Bucket not found.');
  if (data.public) throw new Error('Attachment bucket must remain private.');
  const missing = data.allowed_mime_types ? UPLOAD_MIME_TYPES.filter(type => !data.allowed_mime_types!.includes(type)) : [];
  if (missing.length && process.argv.includes('--apply')) {
    const result = await client.storage.updateBucket(bucket, {
      public: false,
      fileSizeLimit: data.file_size_limit ?? undefined,
      allowedMimeTypes: [...new Set([...data.allowed_mime_types!, ...missing])],
    });
    if (result.error) throw new Error(result.error.message);
    console.log(`${bucket}: added supported file types; privacy and size limit preserved.`);
  } else console.log(`${bucket}: ${missing.length ? `missing ${missing.join(', ')}` : 'all supported file types allowed'}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
