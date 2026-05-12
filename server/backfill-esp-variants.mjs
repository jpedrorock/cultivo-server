/**
 * backfill-esp-variants.mjs
 *
 * Gera variants ESP (320x240 baseline JPEG q70) pra fotos uploaded
 * antes do commit que adicionou geracao automatica no upload.
 *
 * Apos esse commit (be6c23f), uploads novos via /api/upload/image ja'
 * geram o variant <key>.esp.jpg no momento do upload. Esse script
 * cobre as fotos antigas — endpoint device /api/device/plant/:id/photo
 * usa fast path se o variant existir, senao cai no Sharp on-demand
 * (mais lento, 2-5s vs <500ms).
 *
 * Uso:
 *   node server/backfill-esp-variants.mjs            # roda
 *   node server/backfill-esp-variants.mjs --dry-run  # so' conta sem gerar
 *
 * Idempotente: pula arquivos que ja' tem variant.
 * Walk recursivo em uploads/ (pega plant-photos/, health/, etc).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);

let sharp;
try {
  sharp = _require('sharp');
} catch (e) {
  console.error('[backfill] FATAL: sharp not installed:', e.message);
  console.error('  pnpm install sharp');
  process.exit(1);
}

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const DRY_RUN = process.argv.includes('--dry-run');

// Extensoes que valem a pena pre-gerar variant.
const SOURCE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp',
  '.heic', '.heif', '.avif', '.gif',
]);

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return out;
    throw e;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

function isVariant(file) {
  return file.endsWith('.esp.jpg');
}

function variantPath(file) {
  return file.replace(/\.[^.]+$/, '.esp.jpg');
}

async function exists(p) {
  try { await fs.access(p); return true; }
  catch { return false; }
}

async function main() {
  console.log(`[backfill] UPLOADS_DIR=${UPLOADS_DIR}`);
  console.log(`[backfill] mode=${DRY_RUN ? 'DRY RUN (nada sera gerado)' : 'LIVE'}`);

  if (!await exists(UPLOADS_DIR)) {
    console.error(`[backfill] FATAL: ${UPLOADS_DIR} nao existe`);
    process.exit(1);
  }

  const allFiles = await walk(UPLOADS_DIR);
  const sources = allFiles.filter(f => {
    const ext = path.extname(f).toLowerCase();
    if (!SOURCE_EXTS.has(ext)) return false;
    if (isVariant(f)) return false;
    return true;
  });

  console.log(`[backfill] Total files: ${allFiles.length}`);
  console.log(`[backfill] Source candidates: ${sources.length}`);

  let alreadyExists = 0;
  let toGenerate = [];
  for (const src of sources) {
    if (await exists(variantPath(src))) alreadyExists++;
    else toGenerate.push(src);
  }
  console.log(`[backfill] Already have variant: ${alreadyExists}`);
  console.log(`[backfill] Need variant: ${toGenerate.length}`);

  if (DRY_RUN) {
    console.log('\n[backfill] DRY RUN — listing first 10 to-generate:');
    toGenerate.slice(0, 10).forEach(f => console.log(`  ${path.relative(UPLOADS_DIR, f)}`));
    if (toGenerate.length > 10) console.log(`  ... +${toGenerate.length - 10} mais`);
    console.log('\nRun sem --dry-run pra gerar de fato.');
    return;
  }

  if (toGenerate.length === 0) {
    console.log('\n[backfill] Nada pra fazer. Done.');
    return;
  }

  let generated = 0, failed = 0;
  const failures = [];
  const t0 = Date.now();

  for (let i = 0; i < toGenerate.length; i++) {
    const src = toGenerate[i];
    const dst = variantPath(src);
    const rel = path.relative(UPLOADS_DIR, src);
    try {
      const ti = Date.now();
      const buf = await sharp(src)
        .rotate()                                       // EXIF orientation
        .resize({ width: 320, height: 240, fit: 'inside' })
        // Sem mozjpeg: TJPGD do LVGL so' decoda baseline JPEG. mozjpeg
        // encoder ignora `progressive:false` e gera progressive de
        // qualquer jeito (mesmo com optimiseScans:false). libjpeg-turbo
        // default produz baseline garantido. Hit de tamanho ~10-15%
        // (3.5KB vs 3.1KB tipico) — trivial.
        .jpeg({ quality: 70, progressive: false })
        .toBuffer();
      await fs.writeFile(dst, buf);
      const ms = Date.now() - ti;
      generated++;
      console.log(`  [${i + 1}/${toGenerate.length}] ${rel} -> ${buf.length}B (${ms}ms)`);
    } catch (e) {
      failed++;
      failures.push({ src: rel, err: e.message });
      console.warn(`  [${i + 1}/${toGenerate.length}] FAIL ${rel}: ${e.message}`);
    }
  }

  const totalMs = Date.now() - t0;
  console.log(`\n[backfill] DONE em ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`  Generated: ${generated}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Skipped:   ${alreadyExists} (variant ja' existia)`);

  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ${f.src}: ${f.err}`));
  }
}

main().catch(e => {
  console.error('[backfill] crashed:', e);
  process.exit(1);
});
