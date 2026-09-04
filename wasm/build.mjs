#!/usr/bin/env node
/**
 * Сборка protect.wasm из wasm/protect.wat.
 *
 *   npm install wabt      (один раз)
 *   node wasm/build.mjs
 *
 * Бинарник коммитится в репозиторий, чтобы расширение ставилось без
 * тулчейна — пересборка нужна только при правке .wat.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const watPath = join(here, 'protect.wat');
const outPath = join(root, 'protect.wasm');

let wabtFactory;
try {
  wabtFactory = (await import('wabt')).default;
} catch {
  console.error('Не найден пакет wabt. Установите его: npm install wabt');
  process.exit(1);
}

const wabt = await wabtFactory();
const wat = readFileSync(watPath, 'utf8');

let mod;
try {
  mod = wabt.parseWat('protect.wat', wat, {
    exceptions: false, mutable_globals: true, sat_float_to_int: true,
    sign_extension: true, simd: false, threads: false, multi_value: false,
    tail_call: false, bulk_memory: false, reference_types: false,
  });
  mod.resolveNames();
  mod.validate();
} catch (e) {
  console.error('Ошибка сборки protect.wat:\n' + e.message);
  process.exit(1);
}

const { buffer } = mod.toBinary({ log: false, write_debug_names: false });
mod.destroy();

const fresh = Buffer.from(buffer);

// --check: ничего не пишем, только сверяем закоммиченный бинарник с исходником.
// Так релиз не может увезти protect.wasm, не соответствующий protect.wat.
if (process.argv.includes('--check')) {
  let committed;
  try {
    committed = readFileSync(outPath);
  } catch {
    console.error('protect.wasm отсутствует — соберите его: node wasm/build.mjs');
    process.exit(1);
  }
  if (!committed.equals(fresh)) {
    console.error('protect.wasm не совпадает со сборкой из wasm/protect.wat');
    console.error(`  в репозитории: ${committed.length} байт`);
    console.error(`  из исходника:  ${fresh.length} байт`);
    console.error('Пересоберите и закоммитьте: node wasm/build.mjs');
    process.exit(1);
  }
  console.log(`protect.wasm соответствует исходнику (${fresh.length} байт)`);
  process.exit(0);
}

const before = (() => { try { return readFileSync(outPath).length; } catch { return 0; } })();
writeFileSync(outPath, fresh);
console.log(`protect.wasm собран: ${fresh.length} байт (было ${before})`);
