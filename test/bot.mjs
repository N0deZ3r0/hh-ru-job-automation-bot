#!/usr/bin/env node
/**
 * Тесты логики бота: content.js.
 * Запуск: node test/bot.mjs
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

const src = readLF('content.js');
const protect = readLF('hh-protect.js');

let fails = 0;
const eq = (got, want, label) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fails++; console.log(`  FAIL ${label}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`);
  }
};

/** Pull one class method out of the source by brace matching. */
function method(name) {
  const i = src.indexOf('\n            ' + name + '(');
  if (i < 0) throw new Error('method not found: ' + name);
  const open = src.indexOf('{', i);
  let depth = 0, j = open;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(i, j + 1);
}

const bot = new Function('return { ' + [
  method('_todayKey'), method('_dailyCount'), method('_bumpDaily'),
  method('_renderCoverLetter'), method('isFilteredTitle')
].join(',\n') + ' };')();
bot.debouncedSave = () => {};
bot.dailyStats = { date: null, count: 0 };

console.log('Сопроводительное письмо — подстановки');
bot.coverLetter = 'Здравствуйте! Заинтересовала вакансия {вакансия} в компании {компания}. С уважением, Алексей';
eq(bot._renderCoverLetter('Python-разработчик', 'ООО Ромашка'),
   'Здравствуйте! Заинтересовала вакансия Python-разработчик в компании ООО Ромашка. С уважением, Алексей',
   'обе подстановки');
eq(bot._renderCoverLetter('Python-разработчик', null),
   'Здравствуйте! Заинтересовала вакансия Python-разработчик в компании {компания}. С уважением, Алексей',
   'нет компании — плейсхолдер остаётся, письмо не ломается');
// Многострочное письмо: строка с незаполненной подстановкой выбрасывается
// целиком — иначе работодатель получал «Мой опыт: {навыки}» буквально.
bot.mySkills = [];
bot._currentSkills = [];
bot.coverLetter = ['Здравствуйте!', '', 'Вакансия {вакансия}.', '', 'Мой опыт: {навыки}.', '', 'С уважением'].join('\n');
eq(bot._renderCoverLetter('Frontend', 'Ромашка'),
   ['Здравствуйте!', '', 'Вакансия Frontend.', '', 'С уважением'].join('\n'),
   'нет навыков — строка с подстановкой выброшена, остальное цело');
bot._currentSkills = ['JavaScript', 'Linux'];
eq(bot._renderCoverLetter('Frontend', 'Ромашка'),
   ['Здравствуйте!', '', 'Вакансия Frontend.', '', 'Мой опыт: JavaScript, Linux.', '', 'С уважением'].join('\n'),
   'навыки подставлены');
bot.coverLetter = 'Вакансия {VACANCY} / {Компания}';
eq(bot._renderCoverLetter('Data Scientist', 'HeadHunter'), 'Вакансия Data Scientist / HeadHunter', 'регистронезависимо');
bot.coverLetter = 'Без плейсхолдеров вовсе';
eq(bot._renderCoverLetter('X', 'Y'), 'Без плейсхолдеров вовсе', 'текст без подстановок не трогается');
bot.coverLetter = 'A'.repeat(1990) + ' {вакансия}';
eq(bot._renderCoverLetter('Очень длинное название вакансии', 'Z').length, 2000, 'обрезка до лимита hh.ru');

console.log('\nСуточный лимит откликов');
bot.coverLetter = '';
bot.dailyStats = { date: null, count: 0 };
eq(bot._dailyCount(), 0, 'старт с нуля');
bot._bumpDaily(); bot._bumpDaily(); bot._bumpDaily();
eq(bot._dailyCount(), 3, 'три отклика посчитаны');
eq(bot.dailyStats.date, bot._todayKey(), 'дата проставлена');
bot.dailyStats = { date: '2020-01-01', count: 199 };
eq(bot._dailyCount(), 0, 'вчерашние 199 обнуляются при смене суток');
eq(/^\d{4}-\d{2}-\d{2}$/.test(bot._todayKey()), true, 'формат ключа даты');
// главное: лимит больше не пожизненный
const limitSrc = method('isLimitReached');
eq(limitSrc.includes('this.stats.success >= 198'), false, 'пожизненный счётчик больше не используется');
eq(limitSrc.includes('this._dailyCount() >= 198'), true, 'лимит считается по суткам');

console.log('\nСтоп-слова в названии вакансии');
bot.titleStopWords = ['стажёр', 'продажи'];
bot.getVacancyTitleFromCard = () => 'Менеджер по продажам';
eq(bot.isFilteredTitle({}), true, 'по основе: «продажи» ловит «продажам»');
bot.getVacancyTitleFromCard = () => 'Python-разработчик';
eq(bot.isFilteredTitle({}), false, 'подходящая вакансия проходит');
bot.getVacancyTitleFromCard = () => 'СТАЖЁР-аналитик';
eq(bot.isFilteredTitle({}), true, 'регистронезависимо');
bot.titleStopWords = [];
bot.getVacancyTitleFromCard = () => 'Менеджер по продажам';
eq(bot.isFilteredTitle({}), false, 'пустой список ничего не фильтрует');
bot.titleStopWords = ['  ', ''];
eq(bot.isFilteredTitle({}), false, 'пустые строки в списке игнорируются');
bot.titleStopWords = ['продажи'];
bot.getVacancyTitleFromCard = () => null;
eq(bot.isFilteredTitle({}), false, 'нет названия — не фильтруем');
bot.titleStopWords = ['продажи'];
bot.getVacancyTitleFromCard = () => 'Специалист отдела продаж';
eq(bot.isFilteredTitle({}), true, 'основа ловит «продаж»');
bot.getVacancyTitleFromCard = () => 'Продажник в IT';
eq(bot.isFilteredTitle({}), true, 'основа ловит «продажник»');
bot.getVacancyTitleFromCard = () => 'Инженер-программист';
eq(bot.isFilteredTitle({}), false, 'нерелевантное название проходит');
bot.titleStopWords = ['1С'];
bot.getVacancyTitleFromCard = () => 'Программист 1С';
eq(bot.isFilteredTitle({}), true, 'короткое слово сравнивается целиком');

console.log('\nperformance.now — сетка Chrome сохраняется');
const perfSrc = protect.slice(protect.indexOf('var _patchedPerfNow'), protect.indexOf('try {\n            Object.defineProperty(performance'));
eq(perfSrc.includes('Math.round((_origPerfNow() + _nextNoise()) * 10) / 10'), true, 'значение возвращается на сетку 0.1 мс');
eq(perfSrc.includes('v <= _lastPerfValue'), false, 'строгое возрастание убрано — повторы разрешены');
eq(perfSrc.includes('v < _lastPerfValue'), true, 'остаётся только неубывание');
// смоделируем: одинаковый вход должен давать одинаковый выход
let last = 0;
const noiseSeq = [0.01, 0.07, 0.02, 0.09];
const sim = (raw, noise) => { let v = Math.round((raw + noise) * 10) / 10; if (v < last) v = last; last = v; return v; };
const outs = noiseSeq.map(n => sim(1000.5, n));
eq(outs.every(v => Math.abs(v * 10 - Math.round(v * 10)) < 1e-6), true, 'все значения на сетке');
eq(new Set(outs).size <= 2, true, 'повторы возможны, как в настоящем Chrome');

console.log(fails ? `\n${fails} проверок провалено` : '\nВсе проверки пройдены');
process.exit(fails ? 1 : 0);
