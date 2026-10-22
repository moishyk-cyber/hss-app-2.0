import { mkdir, copyFile, cp } from 'node:fs/promises';
const output = new URL('../public/vendor/pdfjs/', import.meta.url);
const source = new URL('../node_modules/pdfjs-dist/', import.meta.url);
await mkdir(output, { recursive: true });
await copyFile(new URL('build/pdf.worker.min.mjs', source), new URL('pdf.worker.min.mjs', output));
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) await cp(new URL(directory, source), new URL(directory, output), { recursive: true });
