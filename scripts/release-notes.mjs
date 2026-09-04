#!/usr/bin/env node
/**
 * Описание релиза в markdown — печатается в stdout.
 *
 *   node scripts/release-notes.mjs [предыдущий-тег]
 *
 * Всё, что можно посчитать, считается из репозитория: версия из манифеста,
 * состав архива из самого архива, список изменений из git. Руками в тексте
 * ничего не проставляется, поэтому описание не разъезжается с кодом.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const version = manifest.version;
const tag = `v${version}`;
const repo = 'N0deZ3r0/hh-ru-job-automation-bot';

const git = (...args) => {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { return ''; }
};

// предыдущий тег: из аргумента или из git
let prev = process.argv[2] || '';
if (!prev) {
  // Ищем по дате создания, а не по маске: ранние релизы назывались
  // HH.Auto.Responder.Pro.V2.3 и под шаблон v* не подходят.
  const tags = git('tag', '--list', '--sort=-creatordate').split('\n').filter(Boolean);
  prev = tags.find((t) => t !== tag) || '';
}

const range = prev ? `${prev}..HEAD` : '';
const commits = (range ? git('log', '--no-merges', '--pretty=format:%s', range) : git('log', '--no-merges', '--pretty=format:%s', '-20'))
  .split('\n').map((s) => s.trim()).filter(Boolean);

const zipPath = join(ROOT, 'dist', `hh-auto-responder-v${version}.zip`);
let zipLine = '';
if (existsSync(zipPath)) {
  const buf = readFileSync(zipPath);
  const sha = createHash('sha256').update(buf).digest('hex');
  const kb = (statSync(zipPath).size / 1024).toFixed(1);
  zipLine = `\`hh-auto-responder-v${version}.zip\` — ${kb} КБ\n\nSHA-256\n\`\`\`\n${sha}\n\`\`\``;
}

// счётчики, чтобы описание не расходилось с содержимым
const rules = JSON.parse(readFileSync(join(ROOT, 'rules.json'), 'utf8')).length;
const wasmSize = existsSync(join(ROOT, 'protect.wasm')) ? statSync(join(ROOT, 'protect.wasm')).size : 0;

const changes = commits.length
  ? commits.map((c) => `- ${c}`).join('\n')
  : '- без изменений с прошлого релиза';

process.stdout.write(`Расширение Chrome, которое откликается на вакансии hh.ru: фильтры, пропуск
вакансий с тестом работодателя, учёт суточного лимита и защита от снятия
отпечатка браузера.

## Установка

1. Скачайте \`hh-auto-responder-v${version}.zip\` ниже и распакуйте в отдельную папку
2. Откройте \`chrome://extensions/\`
3. Включите **режим разработчика**
4. Нажмите **Загрузить распакованное расширение** и выберите эту папку

Собирать ничего не нужно: \`protect.wasm\` уже внутри. На первой странице hh.ru
появится плавающая кнопка-ракета — она открывает панель.

## Что внутри

| | |
|---|---|
| Версия манифеста | ${manifest.manifest_version} |
| Минимальный Chrome | ${manifest.minimum_chrome_version || '111'} |
| Правил блокировки трекеров | ${rules} |
| Модуль WASM | ${wasmSize} байт, собран из \`wasm/protect.wat\` |

Архив содержит только рантайм расширения. Исходник WASM, тесты и CI остаются в
репозитории и в сборку не попадают.

## Изменения${prev ? ` с ${prev}` : ''}

${changes}

## Файл

${zipLine || '_архив собирается на CI_'}

Сборка воспроизводима: ZIP пишется с фиксированными метками времени, поэтому
повторная сборка того же коммита даёт побайтово тот же файл. Перед упаковкой CI
пересобирает \`protect.wasm\` из исходника и сверяет с тем, что лежит в
репозитории, — бинарник в архиве гарантированно соответствует \`protect.wat\`.

---

<details>
<summary>English</summary>

A Chrome extension that applies to hh.ru vacancies for you: filters, employer-test
detection, daily-limit tracking and fingerprint defence.

**Install:** download the ZIP below, unpack it, open \`chrome://extensions/\`,
enable Developer mode, then **Load unpacked** and pick the folder.

The archive holds the extension runtime only. The WASM source, tests and CI stay
in the repository. CI rebuilds \`protect.wasm\` from \`wasm/protect.wat\` and
compares it against the committed binary before packing, so the shipped module
provably matches its source. Builds are reproducible — the ZIP uses fixed
timestamps.

</details>

${prev ? `**Полный список изменений:** https://github.com/${repo}/compare/${prev}...${tag}` : ''}
`);
