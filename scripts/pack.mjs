#!/usr/bin/env node
/**
 * Упаковка расширения в ZIP для релиза.
 *
 *   node scripts/pack.mjs            -> dist/hh-auto-responder-v<версия>.zip
 *   node scripts/pack.mjs --list     -> только список файлов, без записи
 *
 * Список файлов берётся из manifest.json, а не из жёстко прописанного массива:
 * добавите новый скрипт в манифест — он попадёт в сборку сам. В архив идёт
 * только то, что нужно расширению в рантайме; исходники WASM, тесты, CI и
 * документация остаются в репозитории.
 *
 * ZIP пишется вручную через zlib, без внешних пакетов, чтобы сборка работала
 * и на голом CI-раннере, и локально на любой ОС. Временные метки внутри архива
 * фиксированы — одинаковый вход даёт побайтово одинаковый ZIP.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel));

// ── что кладём в архив ──────────────────────────────────────────────────────
const manifest = JSON.parse(read('manifest.json').toString('utf8'));

function fromManifest(m) {
  const out = [];
  const push = (v) => { if (typeof v === 'string' && !v.includes('*')) out.push(v); };

  Object.values(m.icons ?? {}).forEach(push);
  Object.values(m.action?.default_icon ?? {}).forEach(push);
  push(m.action?.default_popup);
  push(m.background?.service_worker);
  (m.background?.scripts ?? []).forEach(push);
  (m.content_scripts ?? []).forEach((e) => {
    (e.js ?? []).forEach(push);
    (e.css ?? []).forEach(push);
  });
  (m.web_accessible_resources ?? []).forEach((e) => {
    if (typeof e === 'string') push(e);
    else (e.resources ?? []).forEach(push);
  });
  (m.declarative_net_request?.rule_resources ?? []).forEach((r) => push(r.path));
  return out;
}

// popup.html подключает свои скрипты и стили сам — манифест о них не знает
function fromHtml(rel) {
  if (!existsSync(join(ROOT, rel))) return [];
  const html = read(rel).toString('utf8');
  const out = [];
  for (const re of [/<script[^>]+src=["']([^"']+)["']/gi, /<link[^>]+href=["']([^"']+)["']/gi]) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const href = m[1];
      if (/^(https?:)?\/\//.test(href) || href.startsWith('data:')) continue;
      out.push(posix.normalize(posix.join(posix.dirname(rel), href)));
    }
  }
  return out;
}

const files = [...new Set([
  'manifest.json',
  ...fromManifest(manifest),
  ...fromHtml(manifest.action?.default_popup ?? 'popup.html'),
  'LICENSE',
])].sort();

const missing = files.filter((f) => !existsSync(join(ROOT, f)));
if (missing.length) {
  console.error('Нет файлов, на которые ссылается манифест:\n  ' + missing.join('\n  '));
  process.exit(1);
}

if (process.argv.includes('--list')) {
  for (const f of files) console.log(`${String(statSync(join(ROOT, f)).size).padStart(8)}  ${f}`);
  console.log(`\nвсего файлов: ${files.length}`);
  process.exit(0);
}

// ── минимальный писатель ZIP ────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Фиксированная метка 1980-01-01: архив воспроизводим, повторная сборка
// того же коммита даёт тот же файл.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

const locals = [];
const central = [];
let offset = 0;

for (const name of files) {
  const data = read(name);
  const deflated = deflateRawSync(data, { level: 9 });
  // если сжатие не помогло — кладём как есть
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const method = useDeflate ? 8 : 0;
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034B50, 0);
  local.writeUInt16LE(20, 4);          // версия для распаковки
  local.writeUInt16LE(0x0800, 6);      // имена в UTF-8
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, nameBuf, body);

  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014B50, 0);
  dir.writeUInt16LE(20, 4);            // версия создателя
  dir.writeUInt16LE(20, 6);
  dir.writeUInt16LE(0x0800, 8);
  dir.writeUInt16LE(method, 10);
  dir.writeUInt16LE(DOS_TIME, 12);
  dir.writeUInt16LE(DOS_DATE, 14);
  dir.writeUInt32LE(crc, 16);
  dir.writeUInt32LE(body.length, 20);
  dir.writeUInt32LE(data.length, 24);
  dir.writeUInt16LE(nameBuf.length, 28);
  dir.writeUInt16LE(0, 30);
  dir.writeUInt16LE(0, 32);
  dir.writeUInt16LE(0, 34);
  dir.writeUInt16LE(0, 36);
  dir.writeUInt32LE(0, 38);
  dir.writeUInt32LE(offset, 42);
  central.push(dir, nameBuf);

  offset += local.length + nameBuf.length + body.length;
}

const centralBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054B50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

const zip = Buffer.concat([...locals, centralBuf, eocd]);

const distDir = join(ROOT, 'dist');
mkdirSync(distDir, { recursive: true });
const outName = `hh-auto-responder-v${manifest.version}.zip`;
writeFileSync(join(distDir, outName), zip);

console.log(`dist/${outName}`);
console.log(`  файлов: ${files.length}`);
console.log(`  размер: ${(zip.length / 1024).toFixed(1)} КБ`);
