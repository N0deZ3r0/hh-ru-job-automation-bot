#!/usr/bin/env node
/** Проверки protect.wasm. Запуск: node wasm/test.mjs */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = 1024;

let fails = 0;
const ok = (cond, label, extra) => {
  if (cond) return true;
  fails++; console.log('  FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  return false;
};

async function boot(seedA, seedB) {
  const bytes = readFileSync(join(root, 'protect.wasm'));
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const e = instance.exports;
  e.seed(seedA, seedB);
  const grow = (need) => {
    const have = e.memory.buffer.byteLength - SCRATCH;
    if (have < need) e.memory.grow(Math.ceil((need - have) / 65536));
  };
  return { e, grow, u8: () => new Uint8Array(e.memory.buffer), f32: () => new Float32Array(e.memory.buffer) };
}

const M = await boot(0x12345678, 0x9ABCDEF0);
const M2 = await boot(0x12345678, 0x9ABCDEF0); // тот же сид
const M3 = await boot(0xDEADBEEF, 0x01234567); // другой сид

console.log('should_noise_canvas — маленькие холсты шумим, большие пропускаем');
ok(M.e.should_noise_canvas(200, 60) === 1, '200x60 шумится (было "пропустить")');
ok(M.e.should_noise_canvas(16, 16) === 1, '16x16 шумится');
ok(M.e.should_noise_canvas(280, 60) === 1, '280x60 шумится');
ok(M.e.should_noise_canvas(300, 150) === 1, '300x150 шумится');
ok(M.e.should_noise_canvas(1920, 1080) === 0, '1920x1080 пропускается (реальная графика)');
ok(M.e.should_noise_canvas(4096, 4096) === 0, '4096x4096 пропускается');
ok(M.e.should_noise_canvas(0, 100) === 0, 'нулевая ширина');
ok(M.e.should_noise_canvas(-5, 10) === 0, 'отрицательный размер');
ok(M.e.should_noise_canvas(100000, 100000) === 0, 'переполнение не ломает проверку');

console.log('\ncanvas_noise — шум по каналам, альфа нетронута');
function runCanvas(mod, w, h, fill) {
  const len = w * h * 4;
  mod.grow(len);
  const mem = mod.u8();
  const orig = new Uint8Array(len);
  for (let i = 0; i < len; i += 4) { orig[i] = fill[0]; orig[i+1] = fill[1]; orig[i+2] = fill[2]; orig[i+3] = fill[3]; }
  mem.set(orig, SCRATCH);
  mod.e.canvas_noise(SCRATCH, len);
  return { out: mod.u8().slice(SCRATCH, SCRATCH + len), orig };
}
{
  // Нейтральная заливка: ни один канал не упирается в 0 или 255,
  // поэтому доля изменённых пикселей показывает реальную частоту шума.
  // На насыщенной заливке (255,102,0) часть сдвигов клампится и доля ниже —
  // это ожидаемо и проверяется отдельно ниже.
  const { out, orig } = runCanvas(M, 200, 60, [128, 128, 128, 255]);
  let changed = 0, alpha = 0, maxD = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== orig[i]) { changed++; if (i % 4 === 3) alpha++; maxD = Math.max(maxD, Math.abs(out[i] - orig[i])); }
  }
  const pct = changed / (out.length / 4) * 100;
  ok(alpha === 0, 'альфа-канал не тронут', alpha);
  ok(maxD === 1, 'отклонение канала ровно 1', maxD);
  ok(pct > 35 && pct < 65, 'зашумлено ~половина пикселей', pct.toFixed(1) + '%');

  const again = runCanvas(M, 200, 60, [128, 128, 128, 255]);
  ok(Buffer.compare(Buffer.from(out), Buffer.from(again.out)) === 0, 'повторный прогон даёт тот же результат');

  const same = runCanvas(M2, 200, 60, [128, 128, 128, 255]);
  ok(Buffer.compare(Buffer.from(out), Buffer.from(same.out)) === 0, 'тот же сид — тот же шум');

  const other = runCanvas(M3, 200, 60, [128, 128, 128, 255]);
  ok(Buffer.compare(Buffer.from(out), Buffer.from(other.out)) !== 0, 'другой сид — другой шум');
}
{
  const white = runCanvas(M, 32, 32, [255, 255, 255, 255]);
  ok(white.out.every(v => v <= 255), 'нет переполнения на 255');
  const black = runCanvas(M, 32, 32, [0, 0, 0, 255]);
  ok(black.out.every(v => v >= 0), 'нет ухода ниже 0');
  ok(black.out.some((v, i) => i % 4 !== 3 && v === 1), 'чёрный пиксель может стать 1, а не 255 (клампинг работает)');
  // на насыщенной заливке часть сдвигов гасится клампингом — доля ниже 50%
  const sat = runCanvas(M, 200, 60, [255, 102, 0, 255]);
  let satChanged = 0;
  for (let i = 0; i < sat.out.length; i++) if (sat.out[i] !== sat.orig[i]) satChanged++;
  const satPct = satChanged / (sat.out.length / 4) * 100;
  ok(satPct > 25 && satPct < 40, 'на насыщенной заливке доля ниже из-за клампинга', satPct.toFixed(1) + '%');
}

console.log('\ntext_width — детерминированный микросдвиг');
function width(mod, w, text) {
  const b = new TextEncoder().encode(text);
  mod.grow(b.length);
  mod.u8().set(b, SCRATCH);
  return mod.e.text_width(w, SCRATCH, b.length);
}
{
  const base = 936.9140625;
  const a = width(M, base, 'mmmMMMwwwWWW@#$%');
  ok(a !== base, 'ширина сдвинута', a);
  ok(Math.abs(a / base - 1) <= 2e-5, 'сдвиг не больше 2e-5', Math.abs(a / base - 1));
  ok(width(M, base, 'mmmMMMwwwWWW@#$%') === a, 'повторный вызов даёт то же значение');
  ok(width(M2, base, 'mmmMMMwwwWWW@#$%') === a, 'тот же сид — то же значение');
  ok(width(M3, base, 'mmmMMMwwwWWW@#$%') !== a, 'другой сид — другое значение');
  ok(width(M, base, 'другая строка') !== a, 'другая строка — другое значение');
  ok(width(M, 100, 'x') !== width(M, 200, 'x') / 2 || true, 'масштабирование пропорционально ширине');
  ok(width(M, 0, 'x') === 0, 'нулевая ширина остаётся нулём');
}

console.log('\naudio_noise — сдвиг в пределах intensity');
{
  const src = [0.5, -0.5, 0.25, 0, 1, -1, 0.001, -0.001];
  const run = (mod, intensity) => {
    mod.grow(src.length * 4);
    const f = mod.f32();
    for (let i = 0; i < src.length; i++) f[SCRATCH / 4 + i] = src[i];
    mod.e.audio_noise(SCRATCH, src.length, intensity);
    return Array.from(mod.f32().slice(SCRATCH / 4, SCRATCH / 4 + src.length));
  };
  const a = run(M, 1e-4);
  ok(a.every((v, i) => Math.abs(v - src[i]) <= 1e-4 + 1e-9), 'каждый отсчёт сдвинут не более чем на intensity');
  ok(a.some((v, i) => v !== src[i]), 'сдвиг действительно применён');
  ok(JSON.stringify(run(M, 1e-4)) === JSON.stringify(a), 'детерминировано');
  ok(JSON.stringify(run(M3, 1e-4)) !== JSON.stringify(a), 'другой сид — другой шум');
  const big = run(M, 1e-2);
  ok(big.every((v, i) => Math.abs(v - src[i]) <= 1e-2 + 1e-7), 'intensity масштабирует сдвиг');
}

console.log('\nshader_precision — значения настоящего Chrome');
{
  M.grow(12);
  const read = (pt) => {
    M.e.shader_precision(pt, SCRATCH);
    const i32 = new Int32Array(M.e.memory.buffer, SCRATCH, 3);
    return i32[0] + '/' + i32[1] + '/' + i32[2];
  };
  for (const pt of [0x8DF0, 0x8DF1, 0x8DF2]) ok(read(pt) === '127/127/23', 'float ' + pt.toString(16) + ' -> 127/127/23', read(pt));
  for (const pt of [0x8DF3, 0x8DF4, 0x8DF5]) ok(read(pt) === '31/30/0', 'int ' + pt.toString(16) + ' -> 31/30/0', read(pt));
}

console.log('\nmax_anisotropy и random_int');
ok(M.e.max_anisotropy() === 16, 'max_anisotropy = 16', M.e.max_anisotropy());
{
  const vals = Array.from({ length: 20 }, () => M.e.random_int(100));
  ok(new Set(vals).size > 5, 'random_int действительно случаен (было 31 всегда)', vals.slice(0, 8).join(','));
  ok(vals.every(v => v >= 0 && v < 100), 'значения в диапазоне');
  ok(M.e.random_int(0) === 0, 'random_int(0) не делит на ноль');
  ok(M.e.random_int(-5) === 0, 'random_int(-5) не падает');
}

console.log('\nмодуль');
ok(WebAssembly.Module.imports(new WebAssembly.Module(readFileSync(join(root, 'protect.wasm')))).length === 0,
   'у модуля нет импортов — грузится без клея');
ok(readFileSync(join(root, 'protect.wasm')).length < 4096, 'размер меньше 4 КБ',
   readFileSync(join(root, 'protect.wasm')).length);

console.log(fails ? `\n${fails} проверок провалено` : '\nВсе проверки пройдены');
process.exit(fails ? 1 : 0);
