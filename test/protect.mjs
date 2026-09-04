#!/usr/bin/env node
/**
 * Тесты защиты: core.js и hh-protect.js.
 * Запуск: node test/protect.mjs
 *
 * Тест читает исходники как текст и вытаскивает из них настоящие функции,
 * поэтому проверяет именно тот код, который поедет в браузер. Зависимостей нет.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Исходники лежат с CRLF — нормализуем, иначе не совпадут текстовые маркеры.
const CR = String.fromCharCode(13);
const readLF = (name) => readFileSync(join(ROOT, name), 'utf8').split(CR).join('');

let fails = 0;
const eq = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`  FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  return ok;
};

function extract(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('start marker not found: ' + startMarker);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error('end marker not found: ' + endMarker);
  return src.slice(a, b);
}

// ── clampNum (content.js) ────────────────────────────────────────────────────
const content = readLF('content.js');
const clampSrc = extract(content, 'function clampNum(', '\n        }\n') + '\n        }\n';
const clampNum = new Function(clampSrc + '; return clampNum;')();

console.log('clampNum — ноль больше не подменяется дефолтом');
eq(clampNum(0, 0, 23, 23, true), 0, 'ночь с 0:00 остаётся 0');
eq(clampNum(0, 0, 100, 70, true), 0, 'порог 0% остаётся 0');
eq(clampNum(8, 0, 23, 23, true), 8, 'обычное значение');
eq(clampNum(undefined, 0, 23, 23, true), 23, 'undefined -> дефолт');
eq(clampNum('abc', 0, 23, 8, true), 8, 'мусор -> дефолт');
eq(clampNum(99, 0, 23, 23, true), 23, 'выше максимума -> максимум');
eq(clampNum(-5, 0, 23, 23, true), 0, 'ниже минимума -> минимум');
eq(clampNum(100, 0.3, 5, 0.5), 5, 'задержка 100с зажимается до 5');
eq(clampNum(0.001, 0.3, 5, 0.5), 0.3, 'задержка 0.001с зажимается до 0.3');
eq(clampNum('2.5', 0.3, 5, 0.5), 2.5, 'строка из input');

// ── matchMedia rewriting (hh-protect.js) ─────────────────────────────────────
const protect = readLF('hh-protect.js');
const mmBody = extract(protect, '            if (!ID.screenWidth || typeof query', '            return origMM(fakeQuery);');
const rewrite = new Function('ID', 'origMM', 'query', mmBody + '\n return fakeQuery;');
const ID = { screenWidth: 1920, screenHeight: 1080 };
const passthrough = (q) => ({ __passthrough: q });

console.log('\nmatchMedia — вьюпортные запросы больше не переписываются');
eq(rewrite(ID, passthrough, '(max-width: 768px)'), { __passthrough: '(max-width: 768px)' },
   'вьюпортный max-width проходит как есть');
eq(rewrite(ID, passthrough, '(min-width: 1200px)'), { __passthrough: '(min-width: 1200px)' },
   'вьюпортный min-width проходит как есть');
eq(rewrite(ID, passthrough, '(prefers-color-scheme: dark)'), { __passthrough: '(prefers-color-scheme: dark)' },
   'нерелевантный запрос проходит как есть');
eq(rewrite(ID, passthrough, '(min-device-width: 1024px)'), '(min-device-width: 1px)',
   'экран 1920 >= 1024 -> всегда истина');
eq(rewrite(ID, passthrough, '(min-device-width: 2560px)'), '(min-device-width: 99999px)',
   'экран 1920 < 2560 -> всегда ложь');
eq(rewrite(ID, passthrough, '(max-device-width: 1024px)'), '(max-device-width: 1px)',
   'экран 1920 > 1024 -> всегда ложь');
eq(rewrite(ID, passthrough, '(max-device-height: 1080px)'), '(max-device-height: 99999px)',
   'экран 1080 <= 1080 -> всегда истина');

// ── jsCanvasNoise (hh-protect.js) ────────────────────────────────────────────
const noiseSrc = extract(protect, '        function jsCanvasNoise(', '\n        }\n') + '\n        }\n';
const jsCanvasNoise = new Function('_canvasSeed', noiseSrc + '; return jsCanvasNoise;')(123456789);

console.log('\njsCanvasNoise — JS-фолбэк шума работает без WASM');
const px = 64 * 64;
const mk = (v) => ({ data: Uint8ClampedArray.from({ length: px * 4 }, () => v) });
const a = mk(128), b = mk(128);
jsCanvasNoise(a);
jsCanvasNoise(b);
eq([...a.data].join() === [...b.data].join(), true, 'детерминирован при одном сиде');
const changed = [...a.data].filter((v, i) => v !== 128).length;
if (changed === 0) { fails++; console.log('  FAIL шум не изменил ни одного канала'); }
else console.log(`  ok  изменено ${changed} из ${px * 4} байт (~${(changed / (px * 4) * 100).toFixed(0)}%)`);
const alphaTouched = [...a.data].filter((v, i) => i % 4 === 3 && v !== 128).length;
eq(alphaTouched, 0, 'альфа-канал не трогается');
// клиппинг на границах
const white = mk(255), black = mk(0);
jsCanvasNoise(white); jsCanvasNoise(black);
eq([...white.data].every(v => v >= 0 && v <= 255), true, 'нет выхода за 255');
eq([...black.data].every(v => v >= 0 && v <= 255), true, 'нет выхода за 0');

// ── isPrivateCandidate (core.js) ─────────────────────────────────────────────
const core = readLF('core.js');
const candSrc = extract(core, '    const PRIVATE_V4 =', '\n    // [FIX RTCPeerConnection');
const isPrivateCandidate = new Function(candSrc + '; return isPrivateCandidate;')();

console.log('\nisPrivateCandidate — больше не режет публичные адреса');
const c = (ip) => `candidate:1 1 udp 2113 ${ip} 54321 typ host`;
eq(isPrivateCandidate(c('192.168.1.5')), true, '192.168/16 приватный');
eq(isPrivateCandidate(c('10.0.0.4')), true, '10/8 приватный');
eq(isPrivateCandidate(c('172.20.3.1')), true, '172.20 приватный (раньше пропускался)');
eq(isPrivateCandidate(c('172.32.3.1')), false, '172.32 публичный');
eq(isPrivateCandidate(c('1.2.10.3')), false, 'публичный с "10." внутри (раньше резался)');
eq(isPrivateCandidate(c('93.110.4.1')), false, 'публичный srflx');
eq(isPrivateCandidate(c('fe80::1')), true, 'link-local IPv6');
eq(isPrivateCandidate(c('fd12:3456::1')), true, 'ULA IPv6');
eq(isPrivateCandidate(c('2a00:1450::1')), false, 'публичный IPv6');
eq(isPrivateCandidate(''), false, 'пустая строка');
eq(isPrivateCandidate(null), false, 'null');

console.log(fails ? `\n${fails} проверок провалено` : '\nВсе проверки пройдены');
process.exit(fails ? 1 : 0);
