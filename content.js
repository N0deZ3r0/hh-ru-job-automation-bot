// ===== HH AUTO RESPONDER v2.4 — BOT LOGIC =====
(function() {
    'use strict';

    const _hn = window.location.hostname;
    if (_hn !== 'hh.ru' && !_hn.endsWith('.hh.ru')) return;

    // В iframe запускаем ТОЛЬКО детектор теста (Блок 1) — бот (Блоки 2-3) не нужен.
    // hh-protect.js сам фильтрует iframe через window.top !== window.self.

    // ───────────────────────────────────────────────────
    // БЛОК 1: ДЕТЕКТОР ТЕСТА
    // ───────────────────────────────────────────────────
    (function() {
        let observer = null;
        let observerTimeout = null;
        let isDestroyed = false;

        function destroyObserver() {
            isDestroyed = true;
            if (observer) { observer.disconnect(); observer = null; }
            if (observerTimeout) { clearTimeout(observerTimeout); observerTimeout = null; }
        }

        function isTestPage() {
            if (window.location.href.includes('startedWithQuestion=false')) return true;
            if (document.querySelector('input[name="testRequired"]')?.value === 'true') return true;
            if (document.querySelector('[data-qa="test-description"]')) return true;
            if (document.querySelector('[data-qa="employer-asking-for-test"]')) return true;
            return false;
        }

        // [FIX storage→chrome] Сохраняем через chrome.storage чтобы данные не были видны hh.ru
        function escapeFromTest() {
            if (window._hh_escaped) return;
            window._hh_escaped = true;
            const vid = window.location.href.match(/vacancyId=(\d+)/)?.[1];
            const empId = window.location.href.match(/employerId=(\d+)/)?.[1];
            if (empId || vid) {
                try {
                    chrome.storage.local.get(['hh-test-employers', 'hh-skipped-vacancies'], (res) => {
                        const testEmps = res['hh-test-employers'] || [];
                        const skipped = res['hh-skipped-vacancies'] || [];
                        let changed = false;
                        if (empId && !testEmps.includes(empId)) {
                            testEmps.push(empId);
                            if (testEmps.length > 500) testEmps.splice(0, testEmps.length - 500);
                            changed = true;
                        }
                        if (vid && !skipped.includes('id_' + vid)) {
                            skipped.push('id_' + vid);
                            if (skipped.length > 500) skipped.splice(0, skipped.length - 500);
                            changed = true;
                        }
                        if (changed) chrome.storage.local.set({ 'hh-test-employers': testEmps, 'hh-skipped-vacancies': skipped });
                    });
                } catch(e) {}
            }
            destroyObserver();
            window.history.back();
        }

        if (isTestPage()) { escapeFromTest(); return; }
        setTimeout(() => { if (!isDestroyed && isTestPage()) escapeFromTest(); }, 500);

        function startObserver() {
            isDestroyed = false;
            if (observer) { observer.disconnect(); observer = null; }
            if (observerTimeout) { clearTimeout(observerTimeout); observerTimeout = null; }
            observer = new MutationObserver(() => {
                if (!isDestroyed && isTestPage()) { destroyObserver(); escapeFromTest(); }
            });
            const target = document.body || document.documentElement;
            if (target) {
                observer.observe(target, { childList: true, subtree: true });
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                    if (!isDestroyed && observer) observer.observe(document.body, { childList: true, subtree: true });
                }, { once: true });
            }
            observerTimeout = setTimeout(() => destroyObserver(), 30000);
        }

        if (document.body) { startObserver(); }
        else { document.addEventListener('DOMContentLoaded', startObserver, { once: true }); }

        window.addEventListener('beforeunload', destroyObserver, { once: true });
        window.addEventListener('popstate', () => {
            destroyObserver();
            window._hh_escaped = false;
            setTimeout(() => {
                if (isTestPage()) { escapeFromTest(); return; }
                startObserver();
            }, 500);
        });
    })();

    // ───────────────────────────────────────────────────
    // БЛОК 2: ОЖИДАНИЕ ЯДРА (только в главном окне)
    // ───────────────────────────────────────────────────
    if (window.top !== window.self) return; // iframe: детектор теста выше уже отработал

    function waitForCore() {
        return new Promise(resolve => {
            if (window.__HH_CORE_READY__) { resolve(); return; }
            const onReady = () => { clearTimeout(fallback); resolve(); };
            window.addEventListener('hh-core-ready', onReady, { once: true });
            const fallback = setTimeout(() => {
                window.removeEventListener('hh-core-ready', onReady);
                resolve();
            }, 10000);
        });
    }

    function tryRestoreBot() {
        if (typeof window.__hh_tryRestoreBot === 'function') {
            window.__hh_tryRestoreBot();
        } else if (!window.hhAutoResponder && window.__hh_bot_instance__) {
            window.hhAutoResponder = window.__hh_bot_instance__;
            window.__hh_bot_instance__.updateStatus?.('Бот восстановлен (fallback)');
        }
    }

    // ───────────────────────────────────────────────────
    // БЛОК 3: ЗАПУСК БОТА
    // ───────────────────────────────────────────────────
    waitForCore().then(() => {
        const VERSION = '2.5';
        console.debug('=== HH Авто-отклик v' + VERSION + ' ===');

        // ── Хранилище: chrome.storage.local вместо localStorage ──────────────
        // Данные недоступны странице hh.ru через JS — защита от детектирования.
        // Все методы асинхронные, поэтому load* вызываются в init() и ждут через Promise.
        const Store = {
            get(keys) {
                return new Promise(resolve => {
                    try { chrome.storage.local.get(keys, res => resolve(res || {})); }
                    catch(e) { resolve({}); }
                });
            },
            set(obj) {
                try { chrome.storage.local.set(obj); } catch(e) {}
            },
            remove(keys) {
                try { chrome.storage.local.remove(keys); } catch(e) {}
            }
        };

        // [FIX] `parseInt(x) || fallback` подменял легитимный 0 значением по умолчанию:
        // порог совпадения 0% превращался в 70%, «ночь с 0:00» — в «с 23:00»,
        // а «до 0:00» — в «до 8:00». Теперь ноль проходит, а мусор — нет.
        function clampNum(v, min, max, dflt, integer) {
            let n = (typeof v === 'number') ? v : parseFloat(v);
            if (!Number.isFinite(n)) return dflt;
            if (integer) n = Math.round(n);
            return Math.min(max, Math.max(min, n));
        }

        class HHAutoResponder {
            constructor() {
                this.coverLetter = "Добрый день! Заинтересовала ваша вакансия. Мой опыт соответствует требованиям. Готов(а) к собеседованию. С уважением, [Ваше Имя]";
                this.isRunning = false;
                this.skippedVacancies = new Set();
                this.testEmployerIds = new Set();
                this.stats = { success: 0, failed: 0, skipped: 0 };
                this.currentPage = 1;
                this.settings = {
                    autoNextPage: true,
                    skipResponded: true,
                    // 0.5 с — самый агрессивный из допустимых темпов. Лимит hh.ru
                    // 200 откликов в сутки всё равно не даёт разогнаться, а iframe
                    // на каждую вакансию больше не грузится — спешить незачем.
                    delay: 1.5,
                    filterOrganizations: true,
                    autoRememberOrganizations: true,
                    skipCoverLetter: false,
                    autoSelectResume: true,
                    resumeTitleMatching: 70,
                    // [NEW] Ночной режим — пауза по расписанию
                    nightModeEnabled: false,
                    nightModeFrom: 23,   // час начала паузы (0-23)
                    nightModeTo: 8,      // час конца паузы (0-23)
                    // [NEW] Доля вакансий, которые бот намеренно пропускает «по-человечески».
                    // Раньше 5% было зашито константой: из 200 откликов в сутки десяток
                    // просто терялся, и понять почему по интерфейсу было нельзя.
                    randomSkipPercent: 5,

                    // [NEW] Фильтры по данным вакансии из стейта страницы.
                    // hh.ru отдаёт по каждой вакансии структурную запись; раньше
                    // расширение читало из неё только признак теста, а фильтровало
                    // лишь по названию работодателя и стоп-словам в заголовке.
                    sortByCompetition: true,   // сначала вакансии с меньшим числом откликов
                    maxCompetitors: 0,         // 0 = без ограничения
                    minSalary: 0,              // 0 = не важно
                    salaryRequired: false,
                    workFormat: 'any',         // any | remote | remote_hybrid | on_site
                    maxExperience: 'any',      // any | noExperience | between1And3 | between3And6
                    maxAgeDays: 0,             // 0 = без ограничения
                    skipInternship: false,
                    skipClosed: true,

                    // [NEW] Совпадение по навыкам. hh.ru печатает в карточке два
                    // сниппета — обязанности и требования (проверено: есть у 50 из 50
                    // карточек, в среднем 301 символ). Пересечение с вашими навыками
                    // даёт и фильтр, и сортировку, и подстановку {навыки} в письмо.
                    sortBySkills: false,
                    minSkillMatch: 0,          // 0 = не фильтровать по навыкам
                    // [NEW] Уведомлять о новых приглашениях
                    notifyInvites: false,

                    // [NEW] Серверные фильтры hh.ru. Замер на живой выдаче python/Москва:
                    // базовый запрос — медиана 273 отклика на вакансию, 6 вакансий из 50
                    // имеют меньше 20 откликов. Тот же запрос с order_by=publication_time —
                    // медиана 13, и уже 32 из 50 с менее чем 20 откликами. Охват при этом
                    // не падает: обе выдачи — те же 3719 вакансий, меняется только порядок.
                    // Фильтровать на стороне hh.ru кратно выгоднее, чем выбрасывать
                    // 45 карточек из 50 уже после загрузки страницы.
                    orderByFresh: true,           // order_by=publication_time
                    labelNoAgency: false,         // label=not_from_agency
                    labelAccreditedIt: false,     // label=accredited_it
                    labelLowPerformance: false,   // label=low_performance («меньше 10 откликов»)
                    serverSideFilters: true,      // переносить формат/опыт/зарплату/свежесть в URL

                    // [NEW] Возможности, найденные в самом hh.ru:
                    // «Поднять в поиске» (data-qa="resume-update-button") поднимает
                    // резюме в выдаче для работодателей — то, что платные сервисы
                    // продают отдельной услугой. Кулдаун держит сам hh.ru.
                    autoBumpResume: false,
                    // Вакансии с тестовым заданием бот пропускает — но хорошие из них
                    // жалко терять. Кладём их в избранное hh.ru для ручного разбора.
                    favoriteSkippedTests: false,
                    // [NEW] Точное сопоставление навыков по странице вакансии.
                    // На /vacancy/<id> лежит keySkills.keySkill — структурный список
                    // требуемых навыков (замер: заполнен у 5 из 7 вакансий, 2-13 штук)
                    // плюс полное описание. Это точнее сниппета из карточки, но стоит
                    // одного запроса на вакансию (~0.76 с), поэтому включается отдельно
                    // и только для вакансий, уже прошедших все дешёвые фильтры.
                    deepMatch: false,
                    // [NEW] Рейтинг работодателя. hh.ru печатает его прямо в карточке
                    // (data-qa="company-review-rating-value") вместе с числом отзывов —
                    // замер: есть у 48 из 50 карточек, разброс 3.2-4.9.
                    // Рейтинг по двум-трём отзывам — шум, поэтому фильтр применяется
                    // только когда отзывов достаточно.
                    minEmployerRating: 0,      // 0 = не фильтровать
                    minReviewsForRating: 3,
                    // [NEW] Возраст вакансии по ДАТЕ СОЗДАНИЯ, а не публикации.
                    // hh.ru показывает всем publicationTime («опубликовано сегодня»),
                    // но в стейте рядом лежит creationTime. Разрыв между ними — это
                    // сколько вакансия реально висит, её перевыкладывают заново.
                    // Замер на живой выдаче: 18 из 50 созданы в день публикации,
                    // 11 висят дольше месяца, рекорд — 114 дней при «опубликовано
                    // сегодня» и 82 откликах. Сортировка «сначала свежие» поднимает
                    // такие вакансии наверх как новые, поэтому фильтр особенно нужен.
                    maxRepostDays: 0,          // 0 = не фильтровать

                    // [NEW] Активность рекрутёра. В стейте выдачи у КАЖДОЙ вакансии
                    // есть employerManager.latestActivity (online/offline).
                    // Замер на 100 вакансиях: у «онлайн» медиана откликов 72,
                    // у «офлайн» — 237, разница в 3,3 раза. Вакансии, за которыми
                    // сейчас следят, и разбирают быстрее.
                    preferManagerOnline: false,   // поднимать такие выше в очереди
                    onlyManagerOnline: false,     // жёсткий фильтр: только онлайн

                    // [NEW] Доля откликов, которые работодатель реально разбирает.
                    // hh.ru печатает её на странице «Отклики» («Разбирает 70% откликов»)
                    // и отдаёт прямо в HTML. Показатель привязан к РАБОТОДАТЕЛЮ, а не к
                    // вакансии — проверено: у одного employerId процент одинаков на разных
                    // вакансиях. Значит, узнав его один раз, можно судить и о других его
                    // вакансиях. До первого отклика он неизвестен, поэтому фильтр работает
                    // накопительно: бот запоминает и больше не тратит отклики впустую.
                    minReviewRate: 0,             // 0 = не фильтровать, иначе процент

                    // [NEW] Искать слово только в НАЗВАНИИ вакансии (search_field=name).
                    // По умолчанию hh.ru ищет по всему тексту, и в выдачу по запросу
                    // «javascript» попадают вакансии, где слово встретилось где угодно.
                    // Замер на живом прогоне: бот отправил отклики на «SEO-специалиста»,
                    // «Руководителя технической поддержки» и даже «Машиниста экскаватора».
                    // С search_field=name выдача — Backend Node.js, Fullstack JS/TS,
                    // «Главный разработчик Javascript». Включено по умолчанию: цена
                    // ошибки здесь выше, чем потеря пары релевантных вакансий.
                    searchInTitleOnly: true
                };
                this.filteredOrganizations = [];
                this.autoFilteredOrganizations = [];
                // [NEW] Стоп-слова в названии вакансии
                this.titleStopWords = [];
                // [NEW] Позитивный фильтр: если список непуст, название вакансии
                // обязано содержать хотя бы одно из слов. Чёрный список отсекает
                // мусор поштучно, белый — сразу всё, что не по профилю.
                this.titleRequiredWords = [];
                // [NEW] Мои навыки — по ним считается совпадение с вакансией.
                this.mySkills = [];
                // [NEW] Очередь поисковых запросов: один URL на строку.
                this.searchQueue = [];
                // [NEW] Снимок статусов откликов — чтобы заметить НОВОЕ приглашение.
                this.inviteSnapshot = null;
                // Когда резюме поднимали в последний раз (мс).
                this.lastBump = 0;
                // [NEW] employerId -> процент разбираемых откликов, накапливается.
                this.employerRates = {};
                // [NEW] Второй вариант письма для A/B. Пустой — чередования нет.
                this.coverLetterB = '';
                // [NEW] Журнал отправленных откликов: на нём держатся отчёт
                // по конверсии и выгрузка в CSV.
                this.responseLog = [];
                // [NEW] Суточный счётчик откликов — hh.ru ограничивает 200 в СУТКИ
                this.dailyStats = { date: null, count: 0 };
                this.theme = 'dark';
                // [NEW] Активная вкладка панели.
                this.activeTab = 'filters';
                this.resumeSelectedFlag = false;
                this.settingsCollapsed = true;
                this.consecutiveErrors = 0;
                // Очередь iframeCheckQueue/waitForIframeSlot удалена: она нигде не
                // заполнялась, сериализацию проверок делает _iframeMutex.
                this._iframeMutex = Promise.resolve();
                this._updateCountInterval = null;
                this._eventListeners = [];
                this._reallyDestroyed = false;
                // [NEW] Лог сессий — последние 30 запусков
                this.sessionLog = [];

                // [FIX version] Поле не заполнялось, а ui.js читает `bot.version` —
                // в подвале панели всегда висела зашитая версия из fallback'а.
                this.version = VERSION;
                this._lastErrorPauseAt = 0;

                // ISOLATED world: эти свойства видны только скриптам расширения,
                // страница hh.ru до них не дотягивается.
                window.hhAutoResponder = this;
                window.__hh_bot_instance__ = this;
                this.init();
            }

            async init() {
                if (this._updateCountInterval) { clearInterval(this._updateCountInterval); this._updateCountInterval = null; }
                await this.loadAll();
                // Автоперезапуск обрабатывает checkAutoRestart() рядом с initBot() —
                // дубль здесь только гонялся с ним за один и тот же флаг sessionStorage.
                tryRestoreBot();
                this.createInterface();
                this.setupEventListeners();
                // Версия и режим WASM показаны в шапке и подвале панели —
                // дублировать их в статусе незачем.
                this.updateStatus('Готов к работе');
                // Метаданные тянем сразу — счётчик «Найдено» должен учитывать тесты
                // ещё до запуска, а не обещать вакансии, которые бот пропустит.
                this._loadVacancyMeta().then(() => this.updateCount()).catch(() => {});
                this._startInviteWatcher();
                this._startBumpWatcher();
            }

            // [NEW] Загружаем всё из chrome.storage за один запрос
            async loadAll() {
                const res = await Store.get([
                    'hh-auto-settings',
                    'hh-skipped-vacancies',
                    'hh-test-employers'
                ]);

                // Настройки
                try {
                    const p = res['hh-auto-settings'];
                    if (p) {
                        if (p.coverLetter && typeof p.coverLetter === 'string') this.coverLetter = p.coverLetter;
                        if (p.settings && typeof p.settings === 'object') {
                            const merged = { ...this.settings, ...p.settings };
                            merged.delay = clampNum(merged.delay, 0.3, 5, 0.5);
                            merged.resumeTitleMatching = clampNum(merged.resumeTitleMatching, 0, 100, 70, true);
                            merged.autoNextPage = !!merged.autoNextPage;
                            merged.skipResponded = !!merged.skipResponded;
                            merged.filterOrganizations = !!merged.filterOrganizations;
                            merged.autoRememberOrganizations = !!merged.autoRememberOrganizations;
                            merged.skipCoverLetter = !!merged.skipCoverLetter;
                            merged.autoSelectResume = !!merged.autoSelectResume;
                            merged.nightModeEnabled = !!merged.nightModeEnabled;
                            merged.nightModeFrom = clampNum(merged.nightModeFrom, 0, 23, 23, true);
                            merged.nightModeTo   = clampNum(merged.nightModeTo,   0, 23, 8,  true);
                            merged.randomSkipPercent = clampNum(merged.randomSkipPercent, 0, 50, 5, true);
                            merged.maxCompetitors = clampNum(merged.maxCompetitors, 0, 100000, 0, true);
                            merged.minSalary      = clampNum(merged.minSalary, 0, 100000000, 0, true);
                            merged.maxAgeDays     = clampNum(merged.maxAgeDays, 0, 365, 0, true);
                            merged.sortByCompetition = !!merged.sortByCompetition;
                            merged.salaryRequired    = !!merged.salaryRequired;
                            merged.skipInternship    = !!merged.skipInternship;
                            merged.skipClosed        = !!merged.skipClosed;
                            merged.sortBySkills      = !!merged.sortBySkills;
                            merged.notifyInvites     = !!merged.notifyInvites;
                            merged.orderByFresh        = !!merged.orderByFresh;
                            merged.labelNoAgency       = !!merged.labelNoAgency;
                            merged.labelAccreditedIt   = !!merged.labelAccreditedIt;
                            merged.labelLowPerformance = !!merged.labelLowPerformance;
                            merged.serverSideFilters   = !!merged.serverSideFilters;
                            merged.autoBumpResume      = !!merged.autoBumpResume;
                            merged.favoriteSkippedTests = !!merged.favoriteSkippedTests;
                            merged.deepMatch = !!merged.deepMatch;
                            merged.minEmployerRating = clampNum(merged.minEmployerRating, 0, 5, 0);
                            merged.minReviewsForRating = clampNum(merged.minReviewsForRating, 1, 100, 3, true);
                            merged.maxRepostDays = clampNum(merged.maxRepostDays, 0, 365, 0, true);
                            merged.preferManagerOnline = !!merged.preferManagerOnline;
                            merged.onlyManagerOnline   = !!merged.onlyManagerOnline;
                            merged.minReviewRate = clampNum(merged.minReviewRate, 0, 100, 0, true);
                            merged.searchInTitleOnly = !!merged.searchInTitleOnly;
                            merged.minSkillMatch     = clampNum(merged.minSkillMatch, 0, 20, 0, true);
                            if (!['any','remote','remote_hybrid','on_site'].includes(merged.workFormat)) merged.workFormat = 'any';
                            if (!['any','noExperience','between1And3','between3And6'].includes(merged.maxExperience)) merged.maxExperience = 'any';
                            this.settings = merged;
                        }
                        if (p.stats && typeof p.stats === 'object') {
                            this.stats = {
                                success: Number(p.stats.success) || 0,
                                failed:  Number(p.stats.failed)  || 0,
                                skipped: Number(p.stats.skipped) || 0
                            };
                        }
                        if (p.theme === 'dark' || p.theme === 'light') this.theme = p.theme;
                        if (typeof p.activeTab === 'string') this.activeTab = p.activeTab;
                        if (Array.isArray(p.filteredOrganizations)) this.filteredOrganizations = p.filteredOrganizations;
                        if (Array.isArray(p.autoFilteredOrganizations)) { this.autoFilteredOrganizations = p.autoFilteredOrganizations; this._autoFilterDirty = true; }
                        if (Array.isArray(p.titleStopWords)) this.titleStopWords = p.titleStopWords.filter(x => typeof x === 'string');
                        if (Array.isArray(p.titleRequiredWords)) this.titleRequiredWords = p.titleRequiredWords.filter(x => typeof x === 'string');
                        if (Array.isArray(p.mySkills)) this.mySkills = p.mySkills.filter(x => typeof x === 'string');
                        if (Array.isArray(p.searchQueue)) this.searchQueue = p.searchQueue.filter(x => typeof x === 'string');
                        if (p.inviteSnapshot && typeof p.inviteSnapshot === 'object') this.inviteSnapshot = p.inviteSnapshot;
                        if (typeof p.lastBump === 'number') this.lastBump = p.lastBump;
                        if (p.employerRates && typeof p.employerRates === 'object') this.employerRates = p.employerRates;
                        if (typeof p.coverLetterB === 'string') this.coverLetterB = p.coverLetterB;
                        if (Array.isArray(p.responseLog)) this.responseLog = p.responseLog.filter(x => x && typeof x === 'object');
                        if (p.dailyStats && typeof p.dailyStats === 'object') {
                            this.dailyStats = {
                                date: typeof p.dailyStats.date === 'string' ? p.dailyStats.date : null,
                                count: clampNum(p.dailyStats.count, 0, 1000, 0, true)
                            };
                        }
                        if (typeof p.currentPage === 'number') this.currentPage = p.currentPage;
                        if (Array.isArray(p.sessionLog)) this.sessionLog = p.sessionLog;
                    }
                } catch(e) { Store.remove('hh-auto-settings'); }

                // Пропущенные вакансии
                try {
                    const parsed = res['hh-skipped-vacancies'];
                    if (Array.isArray(parsed)) {
                        this.skippedVacancies = new Set(parsed.filter(v => typeof v === 'string' && v.startsWith('id_')));
                    }
                } catch(e) { Store.remove('hh-skipped-vacancies'); }

                // Работодатели с тестами
                try {
                    const parsed = res['hh-test-employers'];
                    if (Array.isArray(parsed)) this.testEmployerIds = new Set(parsed.map(String));
                } catch(e) { Store.remove('hh-test-employers'); }
            }

            suspend() {
                this.stopAutoProcess();
                if (this._updateCountInterval) { clearInterval(this._updateCountInterval); this._updateCountInterval = null; }
                if (this._inviteInterval) { clearInterval(this._inviteInterval); this._inviteInterval = null; }
                if (this._bumpInterval) { clearInterval(this._bumpInterval); this._bumpInterval = null; }
                clearTimeout(this._countTimer);
            }

            destroy() {
                this._reallyDestroyed = true;
                this.stopAutoProcess();
                if (this._updateCountInterval) { clearInterval(this._updateCountInterval); this._updateCountInterval = null; }
            }

            addSkippedVacancy(key) {
                if (!key) return;
                this.skippedVacancies.add(String(key));
                // [FIX] Прежний код срезал список до 250 на отметке 300, поэтому ветка
                // «если больше 500» была недостижима, а комментарий описывал дедупликацию
                // по testEmployerIds, которой в коде не было. Оставлен один понятный
                // срез самых старых записей (Set хранит порядок вставки).
                if (this.skippedVacancies.size > 300) {
                    const it = this.skippedVacancies.values();
                    while (this.skippedVacancies.size > 250) {
                        const oldest = it.next();
                        if (oldest.done) break;
                        this.skippedVacancies.delete(oldest.value);
                    }
                }
                Store.set({ 'hh-skipped-vacancies': [...this.skippedVacancies] });
            }

            debouncedSave() {
                clearTimeout(this._saveTimer);
                this._saveTimer = setTimeout(() => this.saveSettings(), 400);
            }

            saveSettings() {
                Store.set({
                    'hh-auto-settings': {
                        coverLetter: this.coverLetter,
                        settings: this.settings,
                        stats: this.stats,
                        theme: this.theme,
                        activeTab: this.activeTab,
                        filteredOrganizations: this.filteredOrganizations,
                        autoFilteredOrganizations: this.autoFilteredOrganizations,
                        titleStopWords: this.titleStopWords,
                        titleRequiredWords: this.titleRequiredWords,
                        mySkills: this.mySkills,
                        searchQueue: this.searchQueue,
                        inviteSnapshot: this.inviteSnapshot,
                        lastBump: this.lastBump,
                        employerRates: this.employerRates,
                        coverLetterB: this.coverLetterB,
                        responseLog: this.responseLog,
                        dailyStats: this.dailyStats,
                        currentPage: this.currentPage,
                        sessionLog: this.sessionLog
                    }
                });
            }

            // [NEW] Экспорт всех данных в JSON-файл
            exportData() {
                try {
                    const data = {
                        version: VERSION,
                        exported: new Date().toISOString(),
                        settings: this.settings,
                        coverLetter: this.coverLetter,
                        filteredOrganizations: this.filteredOrganizations,
                        autoFilteredOrganizations: this.autoFilteredOrganizations,
                        titleStopWords: this.titleStopWords,
                        titleRequiredWords: this.titleRequiredWords,
                        mySkills: this.mySkills,
                        searchQueue: this.searchQueue,
                        coverLetterB: this.coverLetterB,
                        responseLog: this.responseLog,
                        dailyStats: this.dailyStats,
                        skippedVacancies: [...this.skippedVacancies],
                        testEmployerIds: [...this.testEmployerIds],
                        stats: this.stats,
                        sessionLog: this.sessionLog
                    };
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'hh-bot-backup-' + new Date().toISOString().slice(0, 10) + '.json';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    this.updateStatus('Экспорт выполнен ✅');
                } catch(e) { this.updateStatus('Ошибка экспорта: ' + e.message); }
            }

            // [NEW] Импорт данных из JSON-файла
            importData() {
                try {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    // [FIX] Обработчик асинхронный — внешний try/catch его исключения не ловил:
                    // битый JSON давал unhandledrejection и молчание в интерфейсе.
                    // [FIX] Импортируемые настройки теперь проходят ту же нормализацию,
                    // что и загрузка из storage — иначе в delay мог приехать любой мусор.
                    input.onchange = async (e) => {
                        try {
                            const file = e.target.files && e.target.files[0];
                            if (!file) return;
                            const text = await file.text();
                            const data = JSON.parse(text);
                            if (!data || typeof data !== 'object') throw new Error('неверный формат файла');
                            if (data.settings && typeof data.settings === 'object') {
                                const merged = { ...this.settings, ...data.settings };
                                merged.delay = clampNum(merged.delay, 0.3, 5, 0.5);
                                merged.resumeTitleMatching = clampNum(merged.resumeTitleMatching, 0, 100, 70, true);
                                merged.nightModeFrom = clampNum(merged.nightModeFrom, 0, 23, 23, true);
                                merged.nightModeTo   = clampNum(merged.nightModeTo,   0, 23, 8,  true);
                                merged.randomSkipPercent = clampNum(merged.randomSkipPercent, 0, 50, 5, true);
                                for (const k of ['autoNextPage','skipResponded','filterOrganizations',
                                                 'autoRememberOrganizations','skipCoverLetter',
                                                 'autoSelectResume','nightModeEnabled']) {
                                    merged[k] = !!merged[k];
                                }
                                this.settings = merged;
                            }
                            if (typeof data.coverLetter === 'string') this.coverLetter = data.coverLetter;
                            if (Array.isArray(data.filteredOrganizations)) this.filteredOrganizations = data.filteredOrganizations.filter(x => typeof x === 'string');
                            if (Array.isArray(data.autoFilteredOrganizations)) { this.autoFilteredOrganizations = data.autoFilteredOrganizations.filter(x => typeof x === 'string'); this._autoFilterDirty = true; }
                            if (Array.isArray(data.titleStopWords)) this.titleStopWords = data.titleStopWords.filter(x => typeof x === 'string');
                            if (Array.isArray(data.titleRequiredWords)) this.titleRequiredWords = data.titleRequiredWords.filter(x => typeof x === 'string');
                            if (Array.isArray(data.mySkills)) this.mySkills = data.mySkills.filter(x => typeof x === 'string');
                            if (Array.isArray(data.searchQueue)) this.searchQueue = data.searchQueue.filter(x => typeof x === 'string');
                            if (typeof data.coverLetterB === 'string') this.coverLetterB = data.coverLetterB;
                            if (Array.isArray(data.responseLog)) this.responseLog = data.responseLog.filter(x => x && typeof x === 'object');
                            if (Array.isArray(data.skippedVacancies)) this.skippedVacancies = new Set(data.skippedVacancies.filter(x => typeof x === 'string' && x.startsWith('id_')));
                            if (Array.isArray(data.testEmployerIds)) this.testEmployerIds = new Set(data.testEmployerIds.map(String));
                            if (Array.isArray(data.sessionLog)) this.sessionLog = data.sessionLog;
                            // Сохраняем всё включая списки
                            this.saveSettings();
                            Store.set({
                                'hh-skipped-vacancies': [...this.skippedVacancies],
                                'hh-test-employers': [...this.testEmployerIds]
                            });
                            this.createInterface();
                            this.setupEventListeners();
                            this.updateStatus('Импорт выполнен ✅ (' + this.filteredOrganizations.length + ' фильтров, ' + this.skippedVacancies.size + ' пропущенных)');
                        } catch(err) {
                            this.updateStatus('Ошибка импорта: ' + (err && err.message ? err.message : err));
                        }
                    };
                    input.click();
                } catch(e) { this.updateStatus('Ошибка импорта: ' + e.message); }
            }

            // [NEW] Лог сессий — записываем при старте
            _logSessionStart() {
                this._sessionStart = {
                    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
                    successBefore: this.stats.success,
                    failedBefore: this.stats.failed,
                    skippedBefore: this.stats.skipped
                };
            }

            // [NEW] Лог сессий — записываем при остановке
            _logSessionEnd() {
                if (!this._sessionStart) return;
                const entry = {
                    date: this._sessionStart.date,
                    success: this.stats.success - this._sessionStart.successBefore,
                    failed: this.stats.failed - this._sessionStart.failedBefore,
                    skipped: this.stats.skipped - this._sessionStart.skippedBefore,
                    pages: this.currentPage
                };
                if (entry.success + entry.failed > 0) {
                    this.sessionLog.unshift(entry);
                    if (this.sessionLog.length > 30) this.sessionLog.pop();
                    this.saveSettings();
                }
                this._sessionStart = null;
            }

            // [FIX кнопка закрытия] Проверено на живой модалке hh.ru: у неё
            // data-qa="response-popup-close" и aria-label="Отмена".
            // Бот искал data-qa="vacancy-response-popup-close" (лишний префикс vacancy-)
            // и aria-label="Закрыть" — оба селектора не находят НИЧЕГО, то есть
            // closeModal() был полностью холостым, и модалка оставалась висеть.
            // Старые варианты сохранены как запасные — на случай другой раскладки.
            static get CLOSE_SEL() {
                return '[data-qa="response-popup-close"],'
                     + '[data-qa="vacancy-response-popup-close"],'
                     + '[aria-label="Отмена"],[aria-label="Закрыть"]';
            }

            // [FIX лимит] Раньше isLimitReached() смотрел на this.stats.success —
            // счётчик за ВСЁ ВРЕМЯ, который восстанавливается из storage и обнуляется
            // только кнопкой «Очистить». После 198-го успешного отклика за всю жизнь
            // установки бот считал лимит исчерпанным и отказывался работать НАВСЕГДА.
            // Ограничение hh.ru — 200 откликов в сутки, поэтому считаем по дням.
            _todayKey() {
                const d = new Date();
                return d.getFullYear() + '-' +
                       String(d.getMonth() + 1).padStart(2, '0') + '-' +
                       String(d.getDate()).padStart(2, '0');
            }

            _dailyCount() {
                const today = this._todayKey();
                if (!this.dailyStats || this.dailyStats.date !== today) {
                    // Сутки сменились — обнуляем и СРАЗУ сохраняем. Раньше сброс жил
                    // только в памяти до ближайшего debouncedSave(); если вкладку
                    // закрыть раньше, вчерашние 198 подтягивались обратно и бот
                    // считал сегодняшний лимит исчерпанным.
                    this.dailyStats = { date: today, count: 0 };
                    this.debouncedSave();
                }
                return this.dailyStats.count;
            }

            _bumpDaily() {
                this._dailyCount();
                this.dailyStats.count++;
                this.debouncedSave();
            }

            // [NEW] Подстановка в сопроводительное письмо: {вакансия} и {компания}
            // (а также английские {vacancy} / {company}). Письмо под каждую вакансию
            // читается живее шаблонного и заметно повышает шанс ответа.
            // [NEW] Выбор варианта письма. Пока B пустой — всегда A.
            // Чередуем строго поровну: сравнивать два текста можно только на
            // сопоставимых выборках, случайный выбор дал бы перекос.
            _pickLetter() {
                const b = String(this.coverLetterB || '').trim();
                if (!b) return { text: this.coverLetter, variant: 'A' };
                this._letterFlip = !this._letterFlip;
                return this._letterFlip
                    ? { text: this.coverLetter,  variant: 'A' }
                    : { text: this.coverLetterB, variant: 'B' };
            }

            // [NEW] Журнал отправленных откликов — источник для отчёта и CSV.
            _logResponse(vacancyId, employerId, org, title, meta) {
                const wrote = !this.settings.skipCoverLetter || !!(meta && meta.letterRequired);
                this.responseLog.unshift({
                    t: Date.now(),
                    v: vacancyId ? String(vacancyId) : null,
                    e: employerId ? String(employerId) : null,
                    o: org || '',
                    n: title || '',
                    l: wrote ? ((this._currentLetter && this._currentLetter.variant) || 'A') : '—',
                    w: wrote,
                    r: (meta && typeof meta.responses === 'number') ? meta.responses : null
                });
                if (this.responseLog.length > 1000) this.responseLog.length = 1000;
                this.debouncedSave();
            }

            // Массив откликов лежит в стейте страницы /applicant/negotiations,
            // но под ключом с хешем — ищем структурно, по форме записи.
            _findNegotiations(root) {
                let out = null;
                const walk = (o, d) => {
                    if (out || !o || typeof o !== 'object' || d > 5) return;
                    if (Array.isArray(o)) {
                        if (o.length && o[0] && typeof o[0] === 'object' &&
                            'vacancyId' in o[0] && 'lastState' in o[0]) { out = o; return; }
                        return;
                    }
                    for (const k of Object.keys(o)) { try { walk(o[k], d + 1); } catch(e) {} }
                };
                walk(root, 0);
                return out;
            }

            // ═══ ПОДНЯТИЕ РЕЗЮМЕ В ПОИСКЕ ═══
            // На /applicant/resumes у каждого резюме есть родная кнопка
            // data-qa="resume-update-button" («Поднять в поиске»). Жмём именно её,
            // а не внутренний /applicant/resumes/touch: тот требует параметров
            // fingerprintSp и fingerprintIteration2, которые считает сам сайт, —
            // воспроизводить их снаружи и хрупко, и незачем.
            async bumpResumes(silent) {
                if (!silent) this.updateStatus('Открываю список резюме...');
                return new Promise((resolve) => {
                    const f = document.createElement('iframe');
                    f.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1200px;height:900px;opacity:0;pointer-events:none;';
                    f.src = 'https://hh.ru/applicant/resumes';
                    let done = false;
                    const finish = (msg, n) => {
                        if (done) return; done = true;
                        try { f.remove(); } catch(e) {}
                        if (!silent || n) this.updateStatus(msg);
                        resolve(n || 0);
                    };
                    f.addEventListener('load', () => {
                        (async () => {
                            try {
                                await this.wait(2500);
                                const d = f.contentDocument;
                                if (!d || !d.body) return finish('Не удалось открыть страницу резюме', 0);
                                const btns = Array.from(d.querySelectorAll('[data-qa="resume-update-button"]'))
                                    .filter(b => !b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true');
                                if (!btns.length) return finish('Поднимать нечего — интервал hh.ru ещё не прошёл', 0);
                                let n = 0;
                                for (const b of btns) {
                                    try { b.click(); n++; } catch(e) {}
                                    await this.wait(1200);
                                }
                                await this.wait(1500);
                                this.lastBump = Date.now();
                                this.debouncedSave();
                                finish('Резюме поднято: ' + n + ' \u2705', n);
                            } catch(e) { finish('Ошибка поднятия: ' + (e && e.message ? e.message : e), 0); }
                        })();
                    }, { once: true });
                    setTimeout(() => finish('Таймаут поднятия резюме', 0), 40000);
                    if (document.body) document.body.appendChild(f);
                    else finish('Страница не готова', 0);
                });
            }

            _startBumpWatcher() {
                if (this._bumpInterval) { clearInterval(this._bumpInterval); this._bumpInterval = null; }
                if (!this.settings.autoBumpResume) return;
                const FOUR_H = 4 * 3600 * 1000;
                const tick = () => {
                    if (Date.now() - (this.lastBump || 0) < FOUR_H) return;
                    this.bumpResumes(true).catch(() => {});
                };
                this._bumpInterval = setInterval(tick, 30 * 60 * 1000);   // проверяем раз в полчаса
                setTimeout(tick, 20000);
            }

            // [NEW] Избранное hh.ru — родная звёздочка в карточке.
            _addToFavorites(b) {
                try {
                    const card = this._getCard(b);
                    if (!card) return false;
                    const fav = card.querySelector('[data-qa^="vacancy-search-mark-favorite_"]');
                    if (!fav) return false;
                    // _false = ещё не в избранном; _true трогать нельзя, снимет отметку
                    if (!/_false$/.test(fav.getAttribute('data-qa') || '')) return false;
                    fav.click();
                    return true;
                } catch(e) { return false; }
            }

            // [NEW] Импорт автопоисков hh.ru в очередь запросов.
            async importSavedSearches() {
                this.updateStatus('Читаю автопоиски с hh.ru...');
                try {
                    const html = await (await fetch('https://hh.ru/applicant/autosearch', { credentials: 'include' })).text();
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    const raw = Array.from(doc.querySelectorAll('a[href*="/search/vacancy?"]'))
                        .map(a => a.getAttribute('href'))
                        .filter(h => h && h.indexOf('=') > 0);
                    const urls = [];
                    for (const h of raw) {
                        let u;
                        try { u = new URL(h, 'https://hh.ru'); } catch(e) { continue; }
                        const p = u.searchParams;
                        // Ссылка без единого условия поиска — это не автопоиск,
                        // а служебный переход вроде ?hhtmFrom=vacancy_autosearch_list
                        const meaningful = [...p.keys()].filter(k => !/^hhtm/i.test(k));
                        if (!meaningful.length) continue;
                        const clean = u.toString();
                        if (urls.indexOf(clean) < 0) urls.push(clean);
                    }
                    if (!urls.length) {
                        this.updateStatus('Автопоисков не нашлось.\nСоздайте их на hh.ru: поиск \u2192 «Сохранить поиск».');
                        return;
                    }
                    let added = 0;
                    for (const u of urls) {
                        if (this.searchQueue.indexOf(u) < 0) { this.searchQueue.push(u); added++; }
                    }
                    this.saveSettings();
                    this.createInterface();
                    this.setupEventListeners();
                    this.updateStatus('Добавлено в очередь: ' + added + ' из ' + urls.length + ' найденных');
                } catch(e) {
                    this.updateStatus('Не удалось прочитать автопоиски: ' + (e && e.message ? e.message : e));
                }
            }

            // [NEW] Чёрный список hh.ru — родная кнопка «скрыть» в карточке.
            // Только вручную и с подтверждением: это меняет аккаунт, работодатели
            // пропадут из выдачи до очистки списка на hh.ru.
            async blacklistFilteredEmployers() {
                const targets = Array.from(document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]'))
                    .filter(b => this.isFilteredOrganization(b));
                if (!targets.length) {
                    this.updateStatus('На странице нет вакансий, отсеянных фильтром организаций');
                    return;
                }
                if (!confirm('Скрыть на hh.ru работодателей у ' + targets.length + ' вакансий?\n\n' +
                             'Это изменит ваш аккаунт: они исчезнут из вашей выдачи.\n' +
                             'Отменить можно на hh.ru \u2192 Чёрный список работодателей.')) return;
                let n = 0;
                for (const b of targets) {
                    const card = this._getCard(b);
                    const btn = card && card.querySelector('[data-qa="vacancy__blacklist-show-add"]');
                    if (btn) { try { btn.click(); n++; } catch(e) {} await this.wait(700); }
                }
                this.updateStatus('Скрыто работодателей: ' + n + '\nОтменить — hh.ru \u2192 Чёрный список');
            }

            // [NEW] Проверка новых приглашений. Снимок статусов хранится между
            // запусками; уведомление шлётся только когда отклик ПЕРЕШЁЛ в INTERVIEW,
            // а не при первом снятии снимка — иначе первый же запуск сообщил бы
            // обо всех старых приглашениях сразу.
            async _checkInvites() {
                if (!this.settings.notifyInvites) return;
                try {
                    const html = await (await fetch('https://hh.ru/applicant/negotiations', { credentials: 'include' })).text();
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    const st = doc.getElementById('HH-Lux-InitialState');
                    if (!st) return;
                    const raw = st.content ? st.content.textContent : st.textContent;
                    const arr = this._findNegotiations(JSON.parse(raw));
                    if (!arr || !arr.length) return;
                    const prev = this.inviteSnapshot;
                    const now = {};
                    const fresh = [];
                    for (const n of arr) {
                        const k = String(n.vacancyId);
                        now[k] = n.lastState;
                        if (n.lastState === 'INTERVIEW' && prev && prev[k] && prev[k] !== 'INTERVIEW') fresh.push(k);
                    }
                    this.inviteSnapshot = now;
                    this.debouncedSave();
                    if (prev && fresh.length) {
                        this._sendNotification(
                            'Новое приглашение на hh.ru \uD83C\uDF89',
                            fresh.length === 1 ? 'Вас пригласили — откройте «Отклики»'
                                               : 'Новых приглашений: ' + fresh.length
                        );
                    }
                } catch(e) {}
            }

            _startInviteWatcher() {
                if (this._inviteInterval) { clearInterval(this._inviteInterval); this._inviteInterval = null; }
                if (this._bumpInterval) { clearInterval(this._bumpInterval); this._bumpInterval = null; }
                if (!this.settings.notifyInvites) return;
                // Раз в 15 минут: чаще незачем, работодатели отвечают не секундами.
                this._inviteInterval = setInterval(() => this._checkInvites().catch(() => {}), 900000);
                setTimeout(() => this._checkInvites().catch(() => {}), 10000);
            }

            // [NEW] Отчёт по конверсии. Бот считал отправленные отклики, но не знал,
            // работают ли они. hh.ru отдаёт статус каждого отклика (INTERVIEW —
            // позвали, DISCARD — отказ, RESPONSE — молчат), а журнал знает, каким
            // письмом отклик уходил. Вместе это показывает, какой текст работает.
            async showConversion() {
                this.updateStatus('Загружаю статусы откликов с hh.ru...');
                const byVacancy = new Map();
                for (const r of this.responseLog) if (r && r.v) byVacancy.set(String(r.v), r);

                const stats = {}, byRes = {}, byComp = {};
                const mk = (box, key) => box[key] || (box[key] = { total: 0, INTERVIEW: 0, DISCARD: 0, RESPONSE: 0 });
                const bump = (variant, state) => { const s = mk(stats, variant); s.total++; if (s[state] !== undefined) s[state]++; };
                const bumpRes = (id, state) => { const s = mk(byRes, id); s.total++; if (s[state] !== undefined) s[state]++; };
                const bumpComp = (n, state) => {
                    const b = n < 20 ? 'до 20' : n < 50 ? '20–50' : n < 200 ? '50–200' : n < 500 ? '200–500' : '500+';
                    const s = mk(byComp, b); s.total++; if (s[state] !== undefined) s[state]++;
                };

                let seen = 0, matched = 0;
                try {
                    for (let page = 0; page < 5; page++) {
                        const url = 'https://hh.ru/applicant/negotiations' + (page ? '?page=' + page : '');
                        const html = await (await fetch(url, { credentials: 'include' })).text();
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        const st = doc.getElementById('HH-Lux-InitialState');
                        if (!st) break;
                        const raw = st.content ? st.content.textContent : st.textContent;
                        const arr = this._findNegotiations(JSON.parse(raw));
                        if (!arr || !arr.length) break;
                        // Попутно снимаем «Разбирает N% откликов» — hh.ru отдаёт это
                        // прямо в HTML, отдельного запроса не нужно.
                        this._collectReviewRates(doc);
                        for (const n of arr) {
                            seen++;
                            const rec = byVacancy.get(String(n.vacancyId));
                            if (rec) matched++;
                            bump(rec ? (rec.l || 'A') : 'не через бота', n.lastState);
                            // Разбивка по резюме считается по данным hh.ru и работает
                            // даже для откликов, отправленных до появления журнала.
                            bumpRes(String(n.resumeId || '—'), n.lastState);
                            // Разбивка по конкуренции — только для откликов из журнала:
                            // сколько соперников было у вакансии в момент отправки.
                            if (rec && typeof rec.r === 'number') bumpComp(rec.r, n.lastState);
                        }
                        if (arr.length < 20) break;
                        await this.wait(500);
                    }
                } catch(e) {
                    this.updateStatus('Не удалось загрузить отклики: ' + (e && e.message ? e.message : e));
                    return;
                }

                if (!seen) { this.updateStatus('На hh.ru не найдено откликов'); return; }
                const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '0%';
                let out = 'КОНВЕРСИЯ (проверено откликов: ' + seen + ', из них через бота: ' + matched + ')\n';
                const order = Object.keys(stats).sort();
                for (const k of order) {
                    const s = stats[k];
                    out += '\n' + (k.length === 1 ? 'Письмо ' + k : k) + ': ' + s.total
                         + '\n   \uD83D\uDC4D приглашений ' + s.INTERVIEW + ' (' + pct(s.INTERVIEW, s.total) + ')'
                         + '  \u274C отказ ' + s.DISCARD
                         + '  \u23F3 ждут ' + s.RESPONSE;
                }
                if (matched === 0) out += '\n\n* Журнал бота пуст — разбивка по письмам и конкуренции появится после новых откликов.';

                const resKeys = Object.keys(byRes).sort((a, b) => byRes[b].total - byRes[a].total);
                if (resKeys.length > 1) {
                    out += '\n\nПО РЕЗЮМЕ (по данным hh.ru, включая ручные отклики):';
                    for (const k of resKeys) {
                        const r = byRes[k];
                        out += '\n   #' + k + ': ' + r.total + ' \u2192 \uD83D\uDC4D' + r.INTERVIEW + ' (' + pct(r.INTERVIEW, r.total) + ')';
                    }
                }
                const rates = Object.keys(this.employerRates).map(k => this.employerRates[k].rate).filter(x => typeof x === 'number');
                if (rates.length) {
                    rates.sort((a, b) => a - b);
                    const med = rates[Math.floor(rates.length / 2)];
                    const bad = rates.filter(x => x < 50).length;
                    out += '\n\nРАЗБИРАЮТ ОТКЛИКИ (по ' + rates.length + ' работодателям):'
                         + '\n   медиана ' + med + '%'
                         + '\n   ниже 50%: ' + bad
                         + '\n   ниже 30%: ' + rates.filter(x => x < 30).length
                         + '\n   90% и выше: ' + rates.filter(x => x >= 90).length;
                    if (!this.settings.minReviewRate) {
                        out += '\n   * порог в «Фильтрах вакансии» отсеет их заранее';
                    }
                }
                const compOrder = ['до 20', '20–50', '50–200', '200–500', '500+'];
                const compKeys = compOrder.filter(k => byComp[k]);
                if (compKeys.length) {
                    out += '\n\nПО КОНКУРЕНЦИИ (откликов у вакансии на момент отправки):';
                    for (const k of compKeys) {
                        const r = byComp[k];
                        out += '\n   ' + k + ': ' + r.total + ' \u2192 \uD83D\uDC4D' + r.INTERVIEW + ' (' + pct(r.INTERVIEW, r.total) + ')';
                    }
                }
                this.updateStatus(out);
            }

            // [NEW] Снимает со страницы откликов процент разбираемых откликов
            // и запоминает его по работодателю.
            _collectReviewRates(doc) {
                try {
                    const nodes = doc.querySelectorAll('[data-qa="negotiations-employer-statistics"]');
                    for (const n of nodes) {
                        const m = String(n.textContent || '').match(/(\d{1,3})\s*%/);
                        if (!m) continue;
                        const rate = parseInt(m[1], 10);
                        if (!Number.isFinite(rate)) continue;
                        // Идём вверх, пока не найдём карточку со ссылкой на работодателя
                        let el = n, empId = null;
                        for (let i = 0; i < 8 && el; i++) {
                            el = el.parentElement;
                            if (!el) break;
                            const a = el.querySelector('a[href*="/employer/"]');
                            if (a) {
                                const mm = (a.getAttribute('href') || '').match(/\/employer\/(\d+)/);
                                if (mm) { empId = mm[1]; break; }
                            }
                        }
                        if (empId) this.employerRates[empId] = { rate: rate, ts: Date.now() };
                    }
                    const keys = Object.keys(this.employerRates);
                    if (keys.length > 2000) {
                        // Держим последние 2000 — по времени последнего обновления
                        keys.sort((a, b) => (this.employerRates[a].ts || 0) - (this.employerRates[b].ts || 0));
                        for (const k of keys.slice(0, keys.length - 2000)) delete this.employerRates[k];
                    }
                    this.debouncedSave();
                } catch(e) {}
            }

            // [NEW] Выгрузка журнала откликов в CSV — «я уже писал в эту контору?»
            exportResponsesCsv() {
                if (!this.responseLog.length) { this.updateStatus('Журнал откликов пуст'); return; }
                try {
                    const esc = (s) => '"' + String(s === null || s === undefined ? '' : s).replace(/"/g, '""') + '"';
                    const rows = [['дата', 'id вакансии', 'компания', 'вакансия', 'вариант письма', 'письмо', 'откликов у вакансии'].map(esc).join(';')];
                    for (const r of this.responseLog) {
                        rows.push([
                            new Date(r.t || 0).toISOString().slice(0, 16).replace('T', ' '),
                            r.v, r.o, r.n, r.l, r.w ? 'да' : 'нет',
                            (r.r === null || r.r === undefined) ? '' : r.r
                        ].map(esc).join(';'));
                    }
                    // BOM — иначе Excel открывает кириллицу кракозябрами
                    const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'hh-otkliki-' + new Date().toISOString().slice(0, 10) + '.csv';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    this.updateStatus('Выгружено откликов: ' + this.responseLog.length + ' \u2705');
                } catch(e) { this.updateStatus('Ошибка выгрузки: ' + e.message); }
            }

            _renderCoverLetter(vacancyTitle, organization, text) {
                const skills = (this._currentSkills && this._currentSkills.length)
                    ? this._currentSkills.join(', ') : '';
                const map = {
                    'вакансия': vacancyTitle || '',
                    'vacancy':  vacancyTitle || '',
                    'компания': organization || '',
                    'company':  organization || '',
                    'навыки':   skills,
                    'skills':   skills
                };
                // [FIX пустая подстановка] Раньше незаполненный плейсхолдер оставался
                // в тексте как есть, и работодатель получал письмо со строкой
                // «Мой опыт: {навыки}». Теперь пустая подстановка помечается, а
                // строка с ней целиком выбрасывается из письма.
                // [FIX] Незаполненная подстановка раньше уходила работодателю как
                // есть — строкой «Мой опыт: {навыки}». Теперь строка с ней
                // выбрасывается целиком. Но если письмо состоит из одной строки,
                // выброс обнулил бы его: пустое сопроводительное хуже плейсхолдера,
                // поэтому в этом случае текст возвращается нетронутым.
                const HOLE = '\u0000';
                const src = String((text === undefined || text === null) ? (this.coverLetter || '') : text);
                const RE = /\{(вакансия|vacancy|компания|company|навыки|skills)\}/gi;
                const subst = (keepToken) => src.replace(RE, (m, k) => {
                    const v = map[k.toLowerCase()];
                    return (v === undefined || v === '') ? (keepToken ? m : HOLE) : v;
                });
                let out = subst(false);
                if (out.indexOf(HOLE) >= 0) {
                    const kept = out.split(/\r?\n/).filter(line => line.indexOf(HOLE) < 0).join('\n');
                    out = kept.trim() ? kept.replace(/\n{3,}/g, '\n\n').trim() : subst(true);
                }
                // hh.ru не принимает письмо длиннее 2000 символов
                if (out.length > 2000) out = out.slice(0, 2000);
                return out;
            }

            // [NEW] Стоп-слова в названии вакансии — фильтр по должности,
            // а не только по работодателю (например «стажёр», «продажи»).
            isFilteredTitle(b) {
                if (!this.titleStopWords.length) return false;
                const t = (this.getVacancyTitleFromCard(b) || '').toLowerCase();
                if (!t) return false;
                for (const w of this.titleStopWords) {
                    const wl = String(w || '').trim().toLowerCase();
                    if (!wl) continue;
                    // Простое вхождение подстроки не ловит русские окончания:
                    // стоп-слово «продажи» не совпало бы с «Менеджер по продажам».
                    // Отсекаем одну гласную с конца и сравниваем по основе —
                    // «продаж» находит и «продажам», и «продажник».
                    const stem = wl.length >= 4 ? wl.replace(/[аеёиоуыэюяй]$/, '') : wl;
                    if (t.includes(stem)) return true;
                }
                return false;
            }

            wait(ms) { return new Promise(r => setTimeout(r, ms)); }

            async smartDelay() {
                // [NEW] Ночной режим — ждём до конца паузы если сейчас «ночное» время
                if (this.settings.nightModeEnabled) {
                    const checkNight = () => {
                        const h = new Date().getHours();
                        const from = this.settings.nightModeFrom;
                        const to = this.settings.nightModeTo;
                        if (from < to) return h >= from && h < to;
                        // Через полночь: от 23 до 8
                        return h >= from || h < to;
                    };
                    if (checkNight()) {
                        this.updateStatus('🌙 Ночной режим — пауза до ' + this.settings.nightModeTo + ':00');
                        while (checkNight() && this.isRunning) {
                            await this.wait(60000); // проверяем каждую минуту
                        }
                        if (!this.isRunning) return;
                        this.updateStatus('☀️ Ночной режим завершён, продолжаю...');
                        await this.wait(2000);
                    }
                }
                const base = this.settings.delay * 1000;
                const microPause = base * (0.15 + Math.random() * 0.2);
                await this.wait(microPause);
                const mainPause = base * (0.7 + Math.random() * 0.6);
                await this.wait(mainPause);
                if (Math.random() < 0.08) {
                    const thinkPause = 2000 + Math.random() * 3000;
                    await this.wait(thinkPause);
                }
                if (Math.random() < 0.03) {
                    const distractPause = 8000 + Math.random() * 7000;
                    await this.wait(distractPause);
                }
            }

            async humanScroll(element) {
                try {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.wait(300 + Math.random() * 400);
                    if (Math.random() < 0.3) {
                        window.scrollBy({ top: -20 + Math.random() * 40, behavior: 'smooth' });
                        await this.wait(150 + Math.random() * 200);
                    }
                    // Синтетические mousemove к элементу
                    try {
                        const rect = element.getBoundingClientRect();
                        const targetX = rect.left + rect.width * (0.3 + Math.random() * 0.4);
                        const targetY = rect.top + rect.height * (0.3 + Math.random() * 0.4);
                        const steps = 2 + Math.floor(Math.random() * 2);
                        const startX = targetX - (30 + Math.random() * 80);
                        const startY = targetY - (10 + Math.random() * 30);
                        for (let s = 0; s <= steps; s++) {
                            const t = s / steps;
                            const mx = startX + (targetX - startX) * t + (Math.random() - 0.5) * 8;
                            const my = startY + (targetY - startY) * t + (Math.random() - 0.5) * 8;
                            element.dispatchEvent(new MouseEvent('mousemove', {
                                bubbles: true, cancelable: true,
                                clientX: mx, clientY: my,
                                screenX: mx + window.screenX, screenY: my + window.screenY
                            }));
                            if (s < steps) await this.wait(20 + Math.random() * 40);
                        }
                        await this.wait(80 + Math.random() * 120);
                    } catch(e) {}
                } catch(e) {}
            }

            // [FIX humanMouseMove] Исправлен расчёт координат — движение от startX к targetX,
            // а не от (0,0) к targetX*frac как было раньше
            async humanMouseMove(element) {
                try {
                    const rect = element.getBoundingClientRect();
                    if (!rect.width) return;
                    const targetX = rect.left + rect.width * (0.3 + Math.random() * 0.4);
                    const targetY = rect.top + rect.height * (0.3 + Math.random() * 0.4);
                    // Стартовая точка — рядом с элементом, не из угла экрана
                    const startX = targetX - (40 + Math.random() * 100);
                    const startY = targetY - (10 + Math.random() * 40);
                    const steps = 2 + Math.floor(Math.random() * 2);
                    for (let s = 1; s <= steps; s++) {
                        const frac = s / steps;
                        const mx = startX + (targetX - startX) * frac + (Math.random() - 0.5) * 12;
                        const my = startY + (targetY - startY) * frac + (Math.random() - 0.5) * 8;
                        element.dispatchEvent(new MouseEvent('mousemove', {
                            bubbles: true, cancelable: true,
                            clientX: mx, clientY: my,
                            screenX: mx + window.screenX, screenY: my + window.screenY
                        }));
                        await this.wait(20 + Math.random() * 30);
                    }
                    // Финальный mouseover на сам элемент
                    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: targetX, clientY: targetY }));
                    await this.wait(50 + Math.random() * 80);
                } catch(e) {}
            }

            // [FIX offsetParent] По CSSOM у элемента с position:fixed offsetParent
            // ВСЕГДА null. Модалки hh.ru — магриттовские, их оверлей и контейнер
            // объявлены position:fixed, поэтому проверки вида `dialog?.offsetParent`
            // молча считали открытую модалку невидимой. Быстрый путь сохранён:
            // если offsetParent есть — сразу true, лишних измерений нет.
            _isVisible(el) {
                if (!el) return false;
                if (el.offsetParent) return true;
                try {
                    const r = el.getBoundingClientRect();
                    if (!r.width && !r.height) return false;
                    const view = (el.ownerDocument && el.ownerDocument.defaultView) || window;
                    const cs = view.getComputedStyle(el);
                    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
                } catch(e) { return false; }
            }

            // [FIX мёртвый класс] .vacancy-serp-item на текущем hh.ru не существует —
            // вёрстка переехала на CSS-модули (vacancy-card--<hash>). closest() по нему
            // всегда возвращал null, и карточка находилась только запасным селектором.
            // Единая точка входа — тот же _getCard, что используется во всём остальном коде.
            _cardOf(b) {
                return this._getCard(b) || b.closest('[class*="vacancy-card"]');
            }

            // [FIX маркер отклика] data-qa="vacancy-serp__vacancy_responded" и текст
            // «Вы откликнулись» на выдаче больше не встречаются. Актуальный признак —
            // контейнер статуса workflow-status-container--<hash> (для откликнутых,
            // отказов, приглашений). Проверено на живой выдаче: он есть ровно у карточек
            // без кнопки «Откликнуться» и ни у одной из карточек с кнопкой.
            _isRespondedCard(b) {
                const p = this._cardOf(b);
                if (!p) return false;
                if (p.querySelector('[class*="workflow-status-container"]')) return true;
                if (p.querySelector('[data-qa="vacancy-serp__vacancy_responded"]')) return true;
                return (p.textContent || '').includes('Вы откликнулись');
            }

            // [NEW] Признаки того, что hh.ru показал проверку вместо выдачи.
            // Без этого бот при челлендже просто копил ошибки и перезагружал
            // страницу по кругу — ровно то поведение, которое такую проверку и
            // вызывает. Капчу расширение не решает и решать не должно: оно
            // останавливается и зовёт человека.
            _looksBlocked() {
                try {
                    if (document.querySelector('.g-recaptcha,[data-qa*="captcha" i],iframe[src*="recaptcha"],iframe[src*="hcaptcha"]')) return true;
                    if (document.querySelector('[id*="ddg" i][class*="challenge" i],#ddg-challenge')) return true;
                    if (document.querySelector('[data-qa="vacancy-serp__vacancy_response"]')) return false;
                    const t = (document.body ? document.body.innerText : '').slice(0, 3000);
                    if (/captcha|капч|подтвердите, что вы не робот|доступ ограничен|проверка браузера/i.test(t)) return true;
                } catch(e) {}
                return false;
            }

            isLimitReached() {
                if (this._dailyCount() >= 198) return true;
                const lm = document.querySelector('[data-qa-popup-error-code="negotiations-limit-exceeded"]');
                if (this._isVisible(lm)) return true;
                const ue = document.querySelector('[data-qa-popup-error-code="unknown"]');
                if (this._isVisible(ue)) {
                    const t = ue.textContent || '';
                    if ((t.includes('не более 200') || t.includes('лимит') || t.includes('исчерпали')) && this._dailyCount() >= 190) return true;
                }
                // [FIX мёртвый селектор] Классов .magritte-text и .bloko-translate-guard
                // на hh.ru нет: стили собираются CSS-модулями, реальный класс выглядит как
                // magritte-text___pbpft_5-3-12. Точечный селектор не находил НИЧЕГО, и
                // текстовый фолбэк лимита не работал вовсе. Ищем по подстроке класса и
                // только внутри модалок — на выдаче элементов magritte-text больше тысячи,
                // сканировать их все на каждой вакансии слишком дорого.
                const scopes = document.querySelectorAll('[role="dialog"],[role="alertdialog"],[data-qa-popup-error-code]');
                for (const scope of scopes) {
                    const t = scope.textContent || '';
                    if ((t.includes('не более 200 откликов') || t.includes('Вы исчерпали лимит')) && this._isVisible(scope)) return true;
                }
                return false;
            }

            _getCard(b) {
                return b.closest('[data-qa~="vacancy-serp__vacancy"]')
                    || b.closest('[class*="vacancy-card"]:not([class*="vacancy-card-footer"])')
                    || b.closest('[class*="branded-snippet"]');
            }

            getVacancyId(b) {
                if (b.href) { let m = b.href.match(/vacancyId=(\d+)/) || b.href.match(/\/vacancy\/(\d+)/); if (m) return m[1]; }
                const card = this._getCard(b);
                if (card) {
                    const link = card.querySelector('a[href*="vacancyId="], a[href*="/vacancy/"]');
                    if (link) { let m = link.href.match(/vacancyId=(\d+)/) || link.href.match(/\/vacancy\/(\d+)/); if (m) return m[1]; }
                }
                return null;
            }

            getEmployerIdFromCard(b) {
                const card = this._getCard(b);
                if (!card) return null;
                const empLink = card.querySelector('a[href*="/employer/"]');
                if (empLink) { const m = empLink.href.match(/\/employer\/(\d+)/); if (m) return m[1]; }
                return null;
            }

            getOrganizationNameFromCard(b) {
                const card = this._getCard(b);
                if (!card) return null;
                const e = card.querySelector('[data-qa="vacancy-serp__vacancy-employer-text"]')
                       || card.querySelector('[data-qa="vacancy-serp__vacancy-employer"]')
                       || card.querySelector('a[href*="/employer/"]');
                return e ? (e.textContent || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim() : null;
            }

            getVacancyTitleFromCard(b) {
                const card = this._getCard(b);
                if (!card) return null;
                const titleEl = card.querySelector('[data-qa="serp-item__title-text"]');
                return titleEl ? titleEl.textContent.trim() : null;
            }

            // [NEW] Нормализация названия организации: регистр, кавычки и
            // организационно-правовая форма («ООО Ромашка» и «Ромашка» — одна компания).
            _normOrg(s) {
                return String(s || '')
                    .toLowerCase()
                    .replace(/[\u00AB\u00BB\u201C\u201D"'`]/g, ' ')
                    .replace(/(^|\s)(ооо|оао|зао|ао|пао|ип|нко|ltd|llc|inc|gmbh)(\s|$)/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            _rebuildAutoFilterIndex() {
                this._autoFilterSet = new Set(
                    this.autoFilteredOrganizations.map(x => this._normOrg(x)).filter(Boolean)
                );
                this._autoFilterDirty = false;
            }

            isFilteredOrganization(b) {
                if (!this.settings.filterOrganizations) return false;
                const o = this.getOrganizationNameFromCard(b);
                if (!o) return false;
                const ol = o.toLowerCase();
                // Ручной список — вхождение подстроки в обе стороны, но записи короче
                // 3 символов игнорируются: фильтр «ит» иначе блокировал бы «Ситилинк»,
                // «Мвидео» и половину выдачи.
                for (const f of this.filteredOrganizations) {
                    const fl = String(f || '').trim().toLowerCase();
                    if (fl.length < 3) continue;
                    if (ol.includes(fl) || fl.includes(ol)) return true;
                }
                // [FIX лавина ложных срабатываний] Автофильтр наполняется машинально —
                // туда попадает КАЖДАЯ компания, которой отклик уже отправлен. Сравнение
                // по подстроке в обе стороны означало, что короткое название вроде «Дом»
                // из списка блокировало «Домклик», «Домофон.ру» и «Ремонт домов», а после
                // сотни откликов выдача вычищалась почти полностью. Теперь только точное
                // совпадение нормализованного названия — и через Set, а не перебором
                // тысячи строк на каждую из 50 карточек каждые 5 секунд.
                if (this.settings.autoRememberOrganizations) {
                    const on = this._normOrg(o);
                    if (!on) return false;
                    if (!this._autoFilterSet || this._autoFilterDirty) this._rebuildAutoFilterIndex();
                    return this._autoFilterSet.has(on);
                }
                return false;
            }

            addToAutoFilter(o) {
                if (!o || !this.settings.autoRememberOrganizations) return false;
                const ot = o.trim();
                if (!ot) return false;
                const on = this._normOrg(ot);
                if (!on) return false;
                if (!this._autoFilterSet || this._autoFilterDirty) this._rebuildAutoFilterIndex();
                if (this._autoFilterSet.has(on)) return false;
                this.autoFilteredOrganizations.push(ot);
                this._autoFilterSet.add(on);
                if (this.autoFilteredOrganizations.length > 1000) {
                    this.autoFilteredOrganizations.splice(0, this.autoFilteredOrganizations.length - 1000);
                    this._autoFilterDirty = true;   // срез выкинул записи — индекс пересобрать
                }
                this.saveSettings();
                return true;
            }

            showAutoFilter() {
                if (!this.autoFilteredOrganizations.length) { this.updateStatus('Автофильтр пуст'); return; }
                this.updateStatus('АВТОФИЛЬТР (' + this.autoFilteredOrganizations.length + '):\n' + this.autoFilteredOrganizations.map((o, i) => (i + 1) + '. ' + o).join('\n'));
            }

            clearAutoFilter() {
                if (this.autoFilteredOrganizations.length && confirm('Очистить автофильтр?')) {
                    this.autoFilteredOrganizations = [];
                    this._autoFilterDirty = true;
                    this.saveSettings();
                    this.updateStatus('Автофильтр очищен');
                }
            }

            // [NEW] Показать лог сессий
            showSessionLog() {
                if (!this.sessionLog.length) { this.updateStatus('Лог сессий пуст'); return; }
                const lines = this.sessionLog.map(s =>
                    s.date + ' | ✅' + s.success + ' ❌' + s.failed + ' ⏭️' + s.skipped + ' стр.' + (s.pages || 1)
                ).join('\n');
                this.updateStatus('ЛОГ СЕССИЙ:\n' + lines);
            }

            // [NEW] Быстрый и точный источник правды о тестовых заданиях.
            // hh.ru кладёт в страницу выдачи <template id="HH-Lux-InitialState"> со
            // списком вакансий, и у каждой есть два поля, которых НЕТ в разметке карточки:
            //   userTestPresent          — работодатель требует тестовое задание
            //   @responseLetterRequired  — сопроводительное письмо обязательно
            // Замер на живой выдаче python/Москва: 9 вакансий из 50 с тестом, и ни у
            // одной из них в карточке нет ни слова про тест — по DOM это не отследить.
            // Раньше признак теста выяснялся загрузкой страницы отклика в скрытый iframe
            // на КАЖДУЮ вакансию: 2-12 секунд против 0.7 секунды на всю страницу разом.
            async _loadVacancyMeta() {
                const key = location.href;
                if (this._vacancyMetaKey === key && this._vacancyMeta) return this._vacancyMeta;

                const domIds = Array.from(document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]'))
                    .map(b => this.getVacancyId(b)).filter(Boolean);

                const parse = (docLike) => {
                    const st = docLike.getElementById('HH-Lux-InitialState');
                    if (!st) return null;
                    try {
                        const raw = st.content ? st.content.textContent : st.textContent;
                        const j = JSON.parse(raw);
                        const vs = j && j.vacancySearchResult && j.vacancySearchResult.vacancies;
                        if (!Array.isArray(vs) || !vs.length) return null;
                        const m = new Map();
                        for (const v of vs) {
                            const comp = v.compensation || {};
                            const wf = (v.workFormats && v.workFormats[0] && v.workFormats[0].workFormatsElement) || [];
                            m.set(String(v.vacancyId), {
                                test: !!v.userTestPresent,
                                letterRequired: !!v['@responseLetterRequired'],
                                // responsesCount — отклики на ЭТУ вакансию. Разброс на живой
                                // выдаче: от 0 до 7076 при медиане 366. Главный сигнал
                                // конкуренции, и до сих пор он просто пропадал.
                                responses: typeof v.responsesCount === 'number' ? v.responsesCount : null,
                                experience: v.workExperience || null,
                                formats: Array.isArray(wf) ? wf : [],
                                salaryFrom: typeof comp.from === 'number' ? comp.from : null,
                                salaryTo: typeof comp.to === 'number' ? comp.to : null,
                                internship: !!v.internship,
                                closed: !!v.closedForApplicants,
                                published: (v.publicationTime && v.publicationTime.$) ? Date.parse(v.publicationTime.$) : null,
                                created: v.creationTime ? Date.parse(v.creationTime) : null,
                                managerOnline: !!(v.employerManager && v.employerManager.latestActivity === 'online'),
                                viewers: typeof v.online_users_count === 'number' ? v.online_users_count : null
                            });
                        }
                        return m;
                    } catch(e) { return null; }
                };

                // Порог 90%, а не 100%: в выдачу иногда попадают карточки, которых
                // в vacancySearchResult нет (реклама, спецразмещение), и требование
                // полного покрытия гоняло бы лишний запрос на каждой странице.
                const covers = (m) => {
                    if (!m || !domIds.length) return false;
                    const hit = domIds.filter(id => m.has(String(id))).length;
                    return hit >= Math.ceil(domIds.length * 0.9);
                };

                // 1. Инлайновый шаблон — бесплатно и верно сразу после полной загрузки.
                let map = parse(document);

                // 2. После SPA-пагинации шаблон остаётся от ПЕРВОЙ страницы: проверено —
                //    DOM показывает вторую страницу, а template всё ещё первую, и ни один
                //    id не совпадает. Ловим это по покрытию и дозапрашиваем тот же URL
                //    обычным GET — ровно так же делает сам пейджер hh.ru.
                if (!covers(map)) {
                    try {
                        const html = await (await fetch(location.href, { credentials: 'include' })).text();
                        const fresh = parse(new DOMParser().parseFromString(html, 'text/html'));
                        if (covers(fresh) || (fresh && !map)) map = fresh;
                    } catch(e) {}
                }

                this._vacancyMeta = map || null;
                this._vacancyMetaKey = key;
                this._skillCache = new Map();   // другая страница — другие карточки
                return this._vacancyMeta;
            }

            // [NEW] Единая проверка вакансии по данным из стейта. Возвращает
            // причину отказа строкой или null, если вакансия проходит.
            // Одна функция на два места: сбор кнопок и обработку вакансии, —
            // иначе счётчик «Найдено» обещал бы больше, чем бот отправит.
            _metaReject(meta) {
                if (!meta) return null;   // нет данных — не отбрасываем, решит iframe
                const s = this.settings;
                if (s.skipClosed && meta.closed) return 'вакансия закрыта';
                if (meta.test) return 'тестовое задание';
                if (s.skipInternship && meta.internship) return 'стажировка';
                if (s.maxCompetitors > 0 && typeof meta.responses === 'number' && meta.responses > s.maxCompetitors) {
                    return 'откликов ' + meta.responses + ' (> ' + s.maxCompetitors + ')';
                }
                const hasSalary = meta.salaryFrom !== null || meta.salaryTo !== null;
                if (s.salaryRequired && !hasSalary) return 'зарплата не указана';
                if (s.minSalary > 0 && hasSalary) {
                    // Сравниваем по верху вилки: «до 150 000» проходит порог 100 000.
                    // Вакансии без вилки этот фильтр не трогает — для них есть
                    // отдельная галочка «только с указанной зарплатой».
                    const top = meta.salaryTo || meta.salaryFrom || 0;
                    if (top < s.minSalary) return 'зарплата ниже ' + s.minSalary;
                }
                if (s.workFormat !== 'any') {
                    const f = meta.formats || [];
                    if (s.workFormat === 'remote' && !f.includes('REMOTE')) return 'не удалёнка';
                    if (s.workFormat === 'remote_hybrid' && !f.includes('REMOTE') && !f.includes('HYBRID')) return 'не удалёнка/гибрид';
                    if (s.workFormat === 'on_site' && !f.includes('ON_SITE')) return 'не офис';
                }
                if (s.maxExperience !== 'any') {
                    const order = { noExperience: 0, between1And3: 1, between3And6: 2, moreThan6: 3 };
                    const lim = order[s.maxExperience], cur = order[meta.experience];
                    if (lim !== undefined && cur !== undefined && cur > lim) return 'требуют больше опыта';
                }
                if (s.maxAgeDays > 0 && meta.published) {
                    const days = (Date.now() - meta.published) / 86400000;
                    if (days > s.maxAgeDays) return 'старше ' + s.maxAgeDays + ' дн.';
                }
                if (s.onlyManagerOnline && !meta.managerOnline) return 'рекрутёр офлайн';
                if (s.maxRepostDays > 0 && meta.published && meta.created) {
                    // Сколько вакансия крутится на самом деле: от создания до
                    // последней перепубликации. «Опубликовано сегодня» этого не видно.
                    const gap = Math.round((meta.published - meta.created) / 86400000);
                    if (gap > s.maxRepostDays) return 'висит ' + gap + ' дн. (перевыкладывают)';
                }
                return null;
            }

            // ═══ СОВПАДЕНИЕ ПО НАВЫКАМ ═══
            // Текст карточки: название + оба сниппета hh.ru. У анонимного посетителя
            // сниппетов нет — тогда работаем по одному названию, не падая.
            _cardText(b) {
                const card = this._getCard(b);
                if (!card) return '';
                const parts = [
                    card.querySelector('[data-qa="serp-item__title-text"]'),
                    card.querySelector('[data-qa="vacancy-serp__vacancy_snippet_responsibility"]'),
                    card.querySelector('[data-qa="vacancy-serp__vacancy_snippet_requirement"]')
                ];
                let out = '';
                for (const p of parts) if (p) out += ' ' + (p.textContent || '');
                return out.toLowerCase();
            }

            // Какие из МОИХ навыков вакансия действительно упоминает.
            // Возвращаем оригинальные написания — они идут в письмо как есть.
            _matchedSkills(b) {
                if (!this.mySkills.length) return [];
                const vid = this.getVacancyId(b);
                if (!this._skillCache) this._skillCache = new Map();
                if (vid && this._skillCache.has(vid)) return this._skillCache.get(vid);
                const hay = this._cardText(b);
                const out = [];
                if (hay) {
                    for (const raw of this.mySkills) {
                        const sk = String(raw || '').trim();
                        if (sk.length < 2) continue;
                        if (hay.includes(sk.toLowerCase())) out.push(sk);
                    }
                }
                if (vid) this._skillCache.set(vid, out);
                return out;
            }

            // [NEW] Точные навыки со страницы вакансии: сначала теги keySkills,
            // затем полное описание. Кэш на страницу — одна вакансия один запрос.
            async _deepSkills(vacancyId) {
                if (!vacancyId || !this.mySkills.length) return null;
                const key = String(vacancyId);
                if (!this._deepCache) this._deepCache = new Map();
                if (this._deepCache.has(key)) return this._deepCache.get(key);
                let res = null;
                try {
                    // [FIX зависание] У запроса не было таймаута. Замер на живом прогоне:
                    // бот встал с открытой модалкой и замороженным статусом, потому что
                    // этот fetch не отвечал, а Promise.race в processResponse его не
                    // покрывает — он стоит РАНЬШЕ. Обрываем через 6 секунд.
                    const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                    const killer = ctl ? setTimeout(() => { try { ctl.abort(); } catch(e) {} }, 6000) : null;
                    let html;
                    try {
                        html = await (await fetch('https://hh.ru/vacancy/' + key,
                            ctl ? { credentials: 'include', signal: ctl.signal } : { credentials: 'include' })).text();
                    } finally { if (killer) clearTimeout(killer); }
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    const st = doc.getElementById('HH-Lux-InitialState');
                    if (st) {
                        const raw = st.content ? st.content.textContent : st.textContent;
                        const j = JSON.parse(raw) || {};
                        const v = j.vacancyView || {};
                        const tags = (v.keySkills && v.keySkills.keySkill) || [];
                        const desc = String(v.description || '').replace(/<[^>]*>/g, ' ');
                        const hay = (tags.join(' ') + ' ' + desc).toLowerCase();
                        const matched = [];
                        for (const item of this.mySkills) {
                            const sk = String(item || '').trim();
                            if (sk.length < 2) continue;
                            if (hay.indexOf(sk.toLowerCase()) >= 0) matched.push(sk);
                        }
                        res = { matched: matched, tags: tags };
                    }
                } catch(e) {}
                if (this._deepCache.size > 300) this._deepCache.clear();
                this._deepCache.set(key, res);
                return res;
            }

            // [NEW] Рейтинг работодателя из карточки. Возвращает null, если его нет.
            _employerRating(b) {
                const card = this._getCard(b);
                if (!card) return null;
                const rv = card.querySelector('[data-qa="company-review-rating-value"]');
                if (!rv) return null;
                const rating = parseFloat(String(rv.textContent || '').replace(',', '.'));
                if (!Number.isFinite(rating)) return null;
                const rc = card.querySelector('[data-qa="company-review-rating-reviews-count"]');
                const reviews = parseInt(String(rc ? rc.textContent : '').replace(/[^0-9]/g, ''), 10);
                return { rating: rating, reviews: Number.isFinite(reviews) ? reviews : 0 };
            }

            // [NEW] Отсев работодателей, которые не читают отклики.
            // Работает только по накопленным данным: пока процент неизвестен,
            // вакансия не отбрасывается — иначе бот не смог бы его узнать.
            isReviewRateOk(b) {
                const min = this.settings.minReviewRate;
                if (!min) return true;
                const empId = this.getEmployerIdFromCard(b);
                if (!empId) return true;
                const rec = this.employerRates[String(empId)];
                if (!rec || typeof rec.rate !== 'number') return true;
                return rec.rate >= min;
            }

            isRatingOk(b) {
                const min = this.settings.minEmployerRating;
                if (!min) return true;
                const r = this._employerRating(b);
                // Рейтинга нет — не отбрасываем: у части работодателей отзывов просто
                // не набралось, и это не повод пропускать вакансию.
                if (!r) return true;
                if (r.reviews < this.settings.minReviewsForRating) return true;
                return r.rating >= min;
            }

            isSkillMatch(b) {
                const need = this.settings.minSkillMatch;
                if (!need || !this.mySkills.length) return true;
                return this._matchedSkills(b).length >= need;
            }

            // [NEW] Белый список слов в названии. Пустой список — фильтр выключен.
            isRequiredTitle(b) {
                if (!this.titleRequiredWords.length) return true;
                const t = (this.getVacancyTitleFromCard(b) || '').toLowerCase();
                if (!t) return false;
                for (const w of this.titleRequiredWords) {
                    const wl = String(w || '').trim().toLowerCase();
                    if (!wl) continue;
                    const stem = wl.length >= 4 ? wl.replace(/[аеёиоуыэюяй]$/, '') : wl;
                    if (t.includes(stem)) return true;
                }
                return false;
            }

            _metaFor(vacancyId) {
                if (!vacancyId || !this._vacancyMeta) return null;
                return this._vacancyMeta.get(String(vacancyId)) || null;
            }

            async checkTestViaIframe(vacancyId, employerId, organizationName) {
                const _prevLock = this._iframeMutex;
                let _releaseLock;
                this._iframeMutex = new Promise(r => { _releaseLock = r; });
                await _prevLock;
                this.updateStatus('Проверка: ' + (organizationName || '...'));

                return new Promise((resolve) => {
                    const iframe = document.createElement('iframe');
                    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
                    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups';

                    const url = employerId
                        ? 'https://hh.ru/applicant/vacancy_response?vacancyId=' + vacancyId + '&employerId=' + employerId + '&hhtmFrom=vacancy_search_list'
                        : 'https://hh.ru/applicant/vacancy_response?vacancyId=' + vacancyId + '&hhtmFrom=vacancy_search_list';
                    iframe.src = url;

                    let resolved = false;
                    let attempts = 0;
                    let interval = null;

                    const cleanup = () => {
                        if (interval) clearInterval(interval);
                        if (iframe.parentNode) { try { iframe.remove(); } catch(e) {} }
                        _releaseLock();
                    };

                    const finish = (result) => {
                        if (resolved) return;
                        resolved = true;
                        cleanup();
                        resolve(result);
                    };

                    const checkDoc = () => {
                        if (resolved) return;
                        try {
                            const d = iframe.contentDocument || iframe.contentWindow?.document;
                            if (!d || !d.body) return;

                            // 1. Тест
                            if (d.querySelector('[data-qa="test-description"]') ||
                                d.querySelector('[data-qa="employer-asking-for-test"]') ||
                                d.querySelector('input[name="testRequired"]')?.value === 'true' ||
                                (d.location?.href && d.location.href.includes('startedWithQuestion=false'))) {

                                this.addSkippedVacancy('id_' + vacancyId);
                                if (employerId) {
                                    this.testEmployerIds.add(String(employerId));
                                    Store.set({ 'hh-test-employers': [...this.testEmployerIds] });
                                }
                                if (organizationName && this.settings.autoRememberOrganizations) this.addToAutoFilter(organizationName);
                                this.stats.skipped++;
                                this.updateStatsDisplay();
                                finish({ isTest: true });
                                return;
                            }

                            // 2. Прямой отклик
                            // [FIX directLink race] finish() вызывается ДО click() — предотвращает
                            // двойной вызов если interval сработает в промежутке 500мс
                            const directLink = d.querySelector('[data-qa="vacancy-response-link-advertising"]');
                            if (directLink && this._isVisible(directLink)) {
                                // [FIX ложный успех] Прямой отклик уводит на сайт работодателя —
                                // через hh.ru он не отправляется вообще. Раньше здесь стоял
                                // stats.success++ и click() по ссылке внутри скрытого 1x1 iframe:
                                // никакого отклика не уходило, а счётчик успехов рос, при этом
                                // _bumpDaily() не вызывался — «успехи» и суточный счётчик расходились.
                                // Считаем это пропуском и запоминаем вакансию, чтобы не открывать её снова.
                                this.addSkippedVacancy('id_' + vacancyId);
                                if (organizationName && this.settings.autoRememberOrganizations) this.addToAutoFilter(organizationName);
                                this.stats.skipped++;
                                this.updateStatsDisplay();
                                finish({ isTest: false, directResponse: true });
                                return;
                            }

                            // 3. Обычная форма отклика
                            const submitBtn = d.querySelector('[data-qa="vacancy-response-submit-popup"]');
                            if (submitBtn && this._isVisible(submitBtn) && !submitBtn.hasAttribute('disabled')) {
                                finish({ isTest: false });
                                return;
                            }

                            // 4. Ждём ещё
                            if (attempts > 20) {
                                finish({ isTest: false, empty: true });
                                return;
                            }
                        } catch(e) {
                            // SecurityError = CSP заблокировал iframe — это не ошибка бота
                            if (e.name === 'SecurityError' || e.code === 18) {
                                finish({ isTest: false, denied: true });
                            }
                        }
                    };

                    iframe.addEventListener('load', () => {
                        if (resolved) return;
                        // [FIX] Раньше iframe удалялся из DOM прямо здесь. Удаление уничтожает
                        // вложенный browsing context: contentDocument мгновенно становится null,
                        // и checkDoc() ниже не мог увидеть ни тест, ни форму отклика — проверка
                        // всегда доходила до таймаута и возвращала {loaded:true}. То есть
                        // детект тестовых вакансий не работал вообще.
                        // Элемент и так скрыт (1×1 px за экраном) и удаляется в cleanup().
                        setTimeout(() => {
                            checkDoc();
                            if (!resolved) {
                                setTimeout(() => {
                                    checkDoc();
                                    if (!resolved) finish({ isTest: false, loaded: true });
                                }, 1500);
                            }
                        }, 500);
                    }, { once: true });

                    interval = setInterval(() => {
                        attempts++;
                        checkDoc();
                        if (attempts > 30 && !resolved) {
                            finish({ isTest: false, timeout: true });
                        }
                    }, 300);

                    setTimeout(() => {
                        if (!resolved) finish({ isTest: false, timeout: true });
                    }, 12000);

                    if (document.body) {
                        try {
                            document.body.appendChild(iframe);
                        } catch(e) {
                            finish({ isTest: false, appendFailed: true });
                        }
                    } else {
                        finish({ isTest: false, nobody: true });
                    }
                });
            }

            async closeChatIfOpened() {
                try { const b = document.querySelector('[data-qa="chatik-close-chatik"]'); if (this._isVisible(b)) { b.click(); await this.wait(500); return true; } } catch(e) {}
                return false;
            }

            // [NEW] Принудительно закрыть любую открытую модалку через Escape
            async forceCloseAnyModal() {
                try {
                    const modal = document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]');
                    if (this._isVisible(modal)) {
                        const closeBtn = modal.querySelector(HHAutoResponder.CLOSE_SEL);
                        if (closeBtn) { closeBtn.click(); }
                        else { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); }
                        await this.wait(400);
                    }
                } catch(e) {}
            }

            async checkAndCloseDirectResponseModal(o) {
                const dialog = document.querySelector('[role="alertdialog"][aria-modal="true"]');
                if (!this._isVisible(dialog)) return false;
                const title = dialog.querySelector('[data-qa="magritte-alert-title"]') || dialog.querySelector('[data-qa="title"]');
                if (!title?.textContent.includes('прямым откликом')) return false;
                if (o && this.settings.autoRememberOrganizations) this.addToAutoFilter(o);
                const cancelBtn = dialog.querySelector('[data-qa="vacancy-response-link-advertising-cancel"]')
                               || dialog.querySelector(HHAutoResponder.CLOSE_SEL);
                if (cancelBtn) { cancelBtn.click(); }
                else { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); }
                await this.wait(500);
                return true;
            }

            getVacancyTitleFromModal() {
                // [FIX мёртвый класс] .magritte-text / .magritte-text_style-secondary не
                // существуют — CSS-модули добавляют хеш. Ищем по подстроке класса.
                for (const s of ['[data-qa="title-description"] [class*="magritte-text_style-secondary"]', '[data-qa="title-description"] [class*="magritte-text"]', '[class*="magritte-modal-content"] [data-qa="title-description"]', '[role="dialog"] [data-qa="title-description"]', '[data-qa="title-description"]']) {
                    const e = document.querySelector(s);
                    if (e) { const t = e.textContent.trim(); if (t && t.length > 2 && t.length < 200 && !t.includes('Отклик')) return t; }
                }
                return null;
            }

            async closeModal() {
                const b = document.querySelector(HHAutoResponder.CLOSE_SEL);
                if (b) { b.click(); await this.wait(300); }
                // Если кнопка не сработала (или её не нашли) — добиваем Escape.
                // Раньше метод молча ничего не делал и модалка оставалась открытой,
                // из-за чего следующая вакансия обрабатывалась поверх чужой формы.
                const still = document.querySelector('[role="dialog"][aria-modal="true"],[role="alertdialog"][aria-modal="true"]');
                if (still && this._isVisible(still)) {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
                    await this.wait(300);
                }
            }

            // [FIX openResumeDropdown] Retry до 2 раз — на медленных страницах дропдаун не открывается с первого клика
            async openResumeDropdown() {
                for (let attempt = 0; attempt < 2; attempt++) {
                    const rc = document.querySelector('[data-qa="resume-title"]');
                    if (rc) {
                        const cl = rc.closest('[role="button"],[tabindex="0"]');
                        if (cl) {
                            cl.click();
                            await this.wait(600 + attempt * 400);
                            const dd = document.querySelector('[role="listbox"]');
                            if (this._isVisible(dd)) return true;
                        }
                    }
                }
                return false;
            }

            async closeResumeDropdown() {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
                await this.wait(300);
            }

            async getAllResumes() {
                const r = [];
                document.querySelectorAll('label[role="option"][data-interactive="true"]').forEach(i => {
                    const te = i.querySelector('[data-qa="cell-text-content"]');
                    if (te) { const t = te.textContent.trim(); if (t) { const ra = i.querySelector('input[type="radio"]'); r.push({ element: i, title: t, isSelected: ra ? ra.checked : false }); } }
                });
                return r;
            }

            // Оценка совпадения названия вакансии и резюме — вынесена, чтобы
            // считать её и без открытого дропдауна.
            _scoreResume(vt, title) {
                const vl = String(vt || '').toLowerCase(), tl = String(title || '').toLowerCase();
                if (!vl || !tl) return 0;
                if (tl === vl) return 100;
                if (vl.includes(tl)) return 95;
                if (tl.includes(vl)) return 90;
                const vw = vl.split(/[\s,()\-\/]+/).filter(w => w.length > 1);
                const rw = tl.split(/[\s,()\-\/]+/).filter(w => w.length > 1);
                if (!vw.length || !rw.length) return 0;
                let m = 0;
                for (const v of vw) { for (const r of rw) { if (r.includes(v) || v.includes(r)) { m++; break; } } }
                return (m / vw.length) * 100;
            }

            async selectBestResume(vt) {
                if (!this.settings.autoSelectResume || !vt) return false;
                // [FIX холостой дропдаун] Выход по `rs.length <= 1` стоял ПОСЛЕ
                // открытия списка, поэтому при единственном резюме бот открывал и
                // закрывал его на каждой вакансии — около 2 секунд впустую, почти
                // 7 минут на 200 откликов. Количество резюме за сессию не меняется.
                if (this._resumeCount !== undefined && this._resumeCount <= 1) return false;
                // [FIX 8 секунд на вакансию] Список резюме за сессию не меняется.
                // Запомнив названия при первом открытии, дальше считаем совпадение
                // БЕЗ открытия дропдауна и лезем в него только когда резюме реально
                // надо переключить. На выдаче, где ни одно не проходит порог, это
                // экономит около 8 секунд на каждую вакансию.
                if (this._resumeTitles && this._resumeTitles.length > 1) {
                    const cur = (document.querySelector('[data-qa="resume-title"]') || {}).textContent;
                    const curT = String(cur || '').trim();
                    let bestT = null, bestS = 0;
                    for (const t of this._resumeTitles) {
                        if (t === curT) continue;
                        const sc = this._scoreResume(vt, t);
                        if (sc > bestS) { bestS = sc; bestT = t; }
                    }
                    if (!bestT || bestS < this.settings.resumeTitleMatching) return false;
                }
                const op = await this.openResumeDropdown();
                if (!op) return false;
                await this.wait(500);
                try {
                    const rs = await this.getAllResumes();
                    this._resumeCount = rs.length;
                    this._resumeTitles = rs.map(r => r.title);
                    if (rs.length <= 1) { return false; }
                    let best = null, bs = 0;
                    const vl = vt.toLowerCase();
                    for (const r of rs) {
                        if (r.isSelected) continue;
                        const tl = r.title.toLowerCase();
                        let s = 0;
                        if (tl === vl) s = 100;
                        else if (vl.includes(tl)) s = 95;
                        else if (tl.includes(vl)) s = 90;
                        else {
                            const vw = vl.split(/[\s,()\-\/]+/).filter(w => w.length > 1);
                            const rw = tl.split(/[\s,()\-\/]+/).filter(w => w.length > 1);
                            if (vw.length > 0 && rw.length > 0) {
                                let m = 0;
                                for (const v of vw) { for (const rr of rw) { if (rr.includes(v) || v.includes(rr)) { m++; break; } } }
                                s = (m / vw.length) * 100;
                            }
                        }
                        if (s > bs) { bs = s; best = r; }
                    }
                    if (best && bs >= this.settings.resumeTitleMatching) { best.element.click(); await this.wait(500); }
                    return !!(best && bs >= this.settings.resumeTitleMatching);
                } finally {
                    await this.closeResumeDropdown();
                }
            }

            // [NEW] hh.ru может запретить отклик до смены настроек резюме.
            // Замер на живой модалке: «Чтобы откликнуться на эту вакансию, поменяйте
            // видимость резюме на "Видно компаниям-клиентам HeadHunter"», кнопка
            // «Откликнуться» при этом disabled. Раньше бот молча ждал таймаут и
            // оставлял модалку открытой — теперь распознаём и идём дальше.
            _resumeVisibilityBlocked() {
                try {
                    return !!document.querySelector('[data-qa="hidden-resume-warning"]');
                } catch(e) { return false; }
            }

            async submitResponse() {
                let sb = document.querySelector('[data-qa="vacancy-response-submit-popup"]:not([disabled])') || document.querySelector('[data-qa="vacancy-response-submit-popup"]');
                if (!sb) return false;
                if (sb.hasAttribute('disabled')) {
                    await this.wait(1000);
                    sb = document.querySelector('[data-qa="vacancy-response-submit-popup"]:not([disabled])') || document.querySelector('[data-qa="vacancy-response-submit-popup"]');
                    if (!sb || sb.hasAttribute('disabled')) {
                        // [FIX] Предупреждение о видимости резюме бывает и просто
                        // информационным: замер на живой модалке — у «SEO-специалист
                        // (стажер)» оно есть, а кнопка активна и отклик проходит.
                        // Поэтому запретом считаем только случай, когда кнопка так и
                        // НЕ разблокировалась, а предупреждение при этом висит.
                        // Ранняя проверка по одному наличию предупреждения пропускала
                        // вакансии, на которые отклик ушёл бы нормально.
                        if (this._resumeVisibilityBlocked()) return 'RESUME_HIDDEN';
                        return false;
                    }
                }
                sb.click();
                await this.wait(1500);
                if (this.isLimitReached()) return false;
                // [FIX ложный успех] Раньше метод возвращал true, не глядя на результат.
                // Отказ hh.ru (обязательное письмо, вакансия уже закрыта, не заполнены
                // обязательные поля) уходил в «успешно», накручивал суточный счётчик
                // и съедал лимит 200, которого на самом деле не тратилось.
                for (let i = 0; i < 6; i++) {
                    // [NEW] У hh.ru есть ЯВНЫЙ маркер успеха — он надёжнее вывода
                    // «форма исчезла, значит приняли»: форма может закрыться и по
                    // другой причине. Селекторы сняты из бандлов сайта.
                    if (document.querySelector('[data-qa="response-sent-complete"],[data-qa="response-sent-complete-feed"]')) return true;
                    const form = document.querySelector('[data-qa="vacancy-response-submit-popup"]');
                    if (!form || !this._isVisible(form)) return true;   // форма закрылась — отклик принят
                    await this.wait(500);
                }
                // Форма ещё висит, но и ошибки нет — не считаем это провалом,
                // иначе на медленной сети копились бы ложные «ошибки подряд».
                return true;
            }

            // Ошибку ищем только внутри модалки: на выдаче под общий селектор
            // попадает служебная разметка hh.ru, и любой отклик считался бы неудачным.
            // [NEW] hh.ru предупреждает, если работодатель уже отказывал.
            // Смысла слать повторный отклик нет — помечаем вакансию пропущенной.
            _hasRejectWarning() {
                try { return !!document.querySelector('[data-qa="response-reject-warning"],[data-qa="response-reject-warning_status"]'); }
                catch(e) { return false; }
            }

            _hasFormError() {
                const modal = document.querySelector('[role="dialog"][aria-modal="true"],[role="alertdialog"][aria-modal="true"]');
                const scope = modal || document;
                for (const el of scope.querySelectorAll('[data-qa-popup-error-code],[role="alert"]')) {
                    if (this._isVisible(el) && (el.textContent || '').trim()) return true;
                }
                return false;
            }

            async _processResponseInternal(o, depth, vacancyTitle, forceLetter) {
                if (depth > 5) return false;
                if (await this.checkAndCloseDirectResponseModal(o)) return 'DIRECT_RESPONSE';
                if (this._hasRejectWarning()) return 'ALREADY_REJECTED';
                for (let i = 0; i < 3; i++) { await this.closeChatIfOpened(); await this.wait(300); }
                await this.wait(500);
                if (this.settings.autoSelectResume && !this.resumeSelectedFlag) {
                    const vt = vacancyTitle || this.getVacancyTitleFromModal();
                    if (vt) { await this.selectBestResume(vt); this.resumeSelectedFlag = true; await this.wait(500); }
                }
                const ta = document.querySelector('[data-qa="vacancy-response-popup-form-letter-input"]');
                if (ta) {
                    if (!this.settings.skipCoverLetter || forceLetter) {
                        // [NEW] Подставляем название вакансии и компанию в шаблон
                        const chosen = this._currentLetter || { text: this.coverLetter, variant: 'A' };
                        const letter = this._renderCoverLetter(vacancyTitle || this.getVacancyTitleFromModal(), o, chosen.text);
                        const ns = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
                        if (ns) { ns.call(ta, letter); ta.dispatchEvent(new Event('input', { bubbles: true })); }
                        else { ta.value = letter; ta.dispatchEvent(new Event('input', { bubbles: true })); }
                        await this.wait(500);
                    }
                    return await this.submitResponse();
                }
                // [FIX] В модалке письмо раскрывает data-qa="add-cover-letter", а на
                // отдельной странице /applicant/vacancy_response — уже
                // data-qa="vacancy-response-letter-toggle" («Сопроводительное письмо · Добавить»).
                // Бот знал только первый вариант, поэтому на странице письмо не
                // раскрывалось и отклик уходил вообще без сопроводительного.
                const al = document.querySelector('[data-qa="add-cover-letter"], [data-qa="vacancy-response-letter-toggle"]');
                if (al && (!this.settings.skipCoverLetter || forceLetter)) { al.click(); await this.wait(800); return await this._processResponseInternal(o, depth + 1, vacancyTitle, forceLetter); }
                // [NEW] response-anyway — родной селектор кнопки «Откликнуться всё
                // равно» из бандлов hh.ru. Раньше она искалась перебором ВСЕХ кнопок
                // страницы по тексту — и медленно, и ломалось от смены формулировки.
                const rl = document.querySelector('[data-qa="response-anyway"]')
                        || document.querySelector('[data-qa="relocation-warning-confirm"]')
                        || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Все равно откликнуться'));
                if (rl) { rl.click(); await this.wait(800); return await this._processResponseInternal(o, depth + 1, vacancyTitle, forceLetter); }
                return await this.submitResponse();
            }

            async processResponse(o, depth = 0, vacancyTitle = null, forceLetter = false) {
                // [FIX ложные ошибки] Было 15 секунд — короче, чем реальный путь.
                // Замер на живом прогоне: дропдаун резюме съедает ~8 с, раскрытие
                // письма ~1 с, ожидание после клика 1.5 с. Клик по «Откликнуться»
                // приходился на 26-ю секунду, а таймаут срабатывал на 27-й: hh.ru
                // отклик ПРИНИМАЛ, а бот писал ошибку, не увеличивал суточный
                // счётчик и не помечал вакансию — то есть мог откликнуться повторно.
                const TIMEOUT_MS = 45000;
                let timeoutId;
                const timeoutPromise = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS); });
                try {
                    const result = await Promise.race([this._processResponseInternal(o, depth, vacancyTitle, forceLetter), timeoutPromise]);
                    clearTimeout(timeoutId);
                    return result;
                } catch(e) {
                    clearTimeout(timeoutId);
                    // [FIX modal stuck] При таймауте принудительно закрываем модалку через Escape
                    await this.forceCloseAnyModal();
                    return false;
                }
            }

            async safeClick(b) {
                try {
                    await this.humanScroll(b);
                    await this.humanMouseMove(b);
                    await this.wait(100 + Math.random() * 200);
                    b.click();
                    await this.wait(600 + Math.random() * 400);
                    return true;
                } catch(e) { return false; }
            }

            findButtonByVacancyId(vacancyId) {
                if (!vacancyId) return null;
                for (const btn of document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]')) {
                    if (!this._isVisible(btn) || btn.style.display === 'none') continue;
                    if (this.getVacancyId(btn) === vacancyId) return btn;
                }
                return null;
            }

            async waitForButtons(timeoutMs = 8000) {
                const existing = this.getAvailableButtons();
                if (existing.length > 0) return existing;

                return new Promise(resolve => {
                    let timer = null;
                    let obs = null;

                    const done = () => {
                        if (timer) clearTimeout(timer);
                        if (obs) obs.disconnect();
                        resolve(this.getAvailableButtons());
                    };

                    obs = new MutationObserver(() => {
                        if (document.querySelector('[data-qa="vacancy-serp__vacancy_response"]')) done();
                    });

                    const target = document.body || document.documentElement;
                    if (target) obs.observe(target, { childList: true, subtree: true });

                    timer = setTimeout(done, timeoutMs);
                });
            }

            getAvailableButtons() {
                if (window.location.href.includes('/applicant/vacancy_response')) return [];
                const list = Array.from(document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]')).filter(b => {
                    if (!this._isVisible(b) || b.style.display === 'none') return false;
                    if (b.tagName === 'A' && (b.target === '_blank' || (b.href && !b.href.includes('/applicant/vacancy_response')))) return false;
                    if (this.isFilteredOrganization(b)) return false;
                    if (this.isFilteredTitle(b)) return false;
                    if (!this.isRequiredTitle(b)) return false;
                    if (!this.isSkillMatch(b)) return false;
                    if (!this.isRatingOk(b)) return false;
                    if (!this.isReviewRateOk(b)) return false;
                    const vid = this.getVacancyId(b);
                    if (vid && this.skippedVacancies.has('id_' + vid)) return false;
                    const empId = this.getEmployerIdFromCard(b);
                    if (empId && this.testEmployerIds.has(String(empId))) return false;
                    // Метаданные страницы уже загружены — отсеиваем тесты, закрытые,
                    // стажировки и всё, что не проходит фильтры по зарплате, формату,
                    // опыту, свежести и конкуренции. Иначе счётчик «Найдено» обещал бы
                    // больше, чем бот отправит.
                    if (this._metaReject(this._metaFor(vid))) return false;
                    if (this.settings.skipResponded && this._isRespondedCard(b)) return false;
                    return true;
                });
                // [NEW] Сначала наименее конкурентные. Лимит hh.ru — 200 откликов
                // в сутки, и порядок выдачи тратит их на вакансии с сотнями
                // соискателей: на живой выдаче 38 из 50 имели 100+ откликов при
                // медиане 366, хотя рядом лежали три вакансии с нулём.
                if (this.settings.sortByCompetition || this.settings.sortBySkills || this.settings.preferManagerOnline) {
                    const rank = (b) => {
                        const m = this._metaFor(this.getVacancyId(b));
                        return (m && typeof m.responses === 'number') ? m.responses : Number.MAX_SAFE_INTEGER;
                    };
                    list.sort((a, b) => {
                        if (this.settings.preferManagerOnline) {
                            // Онлайн-рекрутёр вперёд: у таких вакансий откликов втрое меньше.
                            const ma = this._metaFor(this.getVacancyId(a));
                            const mb = this._metaFor(this.getVacancyId(b));
                            const d0 = (mb && mb.managerOnline ? 1 : 0) - (ma && ma.managerOnline ? 1 : 0);
                            if (d0) return d0;
                        }
                        if (this.settings.sortBySkills && this.mySkills.length) {
                            // Больше совпавших навыков — раньше. При равенстве решает конкуренция.
                            const d = this._matchedSkills(b).length - this._matchedSkills(a).length;
                            if (d) return d;
                        }
                        if (this.settings.sortByCompetition) return rank(a) - rank(b);
                        return 0;
                    });
                }
                return list;
            }

            async processSingleVacancy(b, i, t) {
                tryRestoreBot();
                const bot = window.hhAutoResponder || this;
                if (!bot.isRunning) return false;
                if (bot.isLimitReached()) { bot.updateStatus('Лимит откликов. Остановка.'); bot.stopAutoProcess(); return false; }

                // [FIX modal stuck] Принудительно закрываем любую висящую модалку перед началом
                await bot.forceCloseAnyModal();

                const o = bot.getOrganizationNameFromCard(b);
                const vacancyId = bot.getVacancyId(b);
                const employerId = bot.getEmployerIdFromCard(b);
                const vacancyTitle = bot.getVacancyTitleFromCard(b);

                // Быстрые фильтры (null = пропуск без счётчика ошибок)
                if (!bot._isVisible(b) || b.style.display === 'none') return null;
                if (b.tagName === 'A' && (b.target === '_blank' || (b.href && !b.href.includes('/applicant/vacancy_response')))) return null;
                if (bot.isFilteredOrganization(b)) { bot.stats.skipped++; bot.updateStatsDisplay(); return null; }
                if (bot.isFilteredTitle(b)) { bot.stats.skipped++; bot.updateStatsDisplay(); return null; }
                if (!bot.isRequiredTitle(b)) { bot.stats.skipped++; bot.updateStatsDisplay(); return null; }
                if (!bot.isSkillMatch(b)) { bot.stats.skipped++; bot.updateStatsDisplay(); return null; }
                if (!bot.isRatingOk(b)) { bot.stats.skipped++; bot.updateStatsDisplay(); return null; }
                if (!bot.isReviewRateOk(b)) { bot.stats.skipped++; bot.updateStatsDisplay(); return null; }
                if (vacancyId && bot.skippedVacancies.has('id_' + vacancyId)) return null;
                if (employerId && bot.testEmployerIds.has(String(employerId))) { bot.stats.skipped++; bot.updateStatsDisplay(); return null; }
                if (bot.settings.skipResponded && bot._isRespondedCard(b)) return null;

                // Случайный пропуск части вакансий — имитирует поведение реального
                // пользователя. Доля настраивается; 0% отключает пропуск полностью.
                if (Math.random() * 100 < bot.settings.randomSkipPercent) {
                    bot.stats.skipped++;
                    bot.updateStatsDisplay();
                    return null;
                }

                // Тест виден прямо из стейта страницы — открывать вакансию незачем.
                const meta = bot._metaFor(vacancyId);
                if (meta && meta.test) {
                    // Вакансия с тестовым — бот её не берёт, но она может быть хорошей.
                    if (bot.settings.favoriteSkippedTests) bot._addToFavorites(b);
                    bot.addSkippedVacancy('id_' + vacancyId);
                    if (employerId) {
                        bot.testEmployerIds.add(String(employerId));
                        Store.set({ 'hh-test-employers': [...bot.testEmployerIds] });
                    }
                    if (o && bot.settings.autoRememberOrganizations) bot.addToAutoFilter(o);
                    bot.stats.skipped++;
                    bot.updateStatsDisplay();
                    return null;
                }
                // Остальные фильтры по данным вакансии — зарплата, формат, опыт,
                // свежесть, конкуренция, стажировка, закрытая вакансия.
                const rejectReason = bot._metaReject(meta);
                if (rejectReason) {
                    if (vacancyId) bot.addSkippedVacancy('id_' + vacancyId);
                    bot.stats.skipped++;
                    bot.updateStatsDisplay();
                    return null;
                }
                // Стейт эту вакансию не покрыл — падаем в медленную проверку через iframe.
                // Когда meta есть и теста нет, iframe не нужен вовсе: «прямой отклик»
                // всё равно перехватывается ниже через checkAndCloseDirectResponseModal().
                if (vacancyId && !meta) {
                    const checkResult = await bot.checkTestViaIframe(vacancyId, employerId, o);
                    // isTest/directResponse — не ошибки, возвращаем null
                    if (checkResult.isTest) return null;
                    if (checkResult.directResponse) return null;
                    // denied = iframe заблокирован CSP — продолжаем без счётчика ошибок
                }

                await bot.wait(500 + Math.random() * 500);
                const _progressPct = t > 0 ? Math.round(((i + 1) / t) * 100) : 0;
                bot.updateStatus('Стр.' + bot.currentPage + ' | ' + (i + 1) + '/' + t + ' (' + _progressPct + '%) — ' + (o || 'Обработка...'));

                let targetBtn = b;
                if (!bot._isVisible(b)) {
                    // [FIX] Без vacancyId targetBtn оставался прежней — уже невидимой —
                    // кнопкой, и бот кликал по элементу, которого нет на экране.
                    targetBtn = vacancyId ? bot.findButtonByVacancyId(vacancyId) : null;
                    if (!targetBtn) { bot.stats.skipped++; bot.updateStatsDisplay(); return null; }
                }

                if (!(await bot.safeClick(targetBtn))) {
                    bot.stats.failed++;
                    bot.consecutiveErrors++;
                    bot.updateStatsDisplay();
                    return false;
                }

                // Активное ожидание модалки вместо фиксированного sleep
                const modalAppeared = await bot._waitForModal(3000);
                if (!modalAppeared) {
                    if (await bot.checkAndCloseDirectResponseModal(o)) {
                        bot.stats.skipped++;
                        if (vacancyId) bot.addSkippedVacancy('id_' + vacancyId);
                        bot.updateStatsDisplay();
                        return null;
                    }
                    // [FIX url redirect] Если попали на страницу отклика — возвращаемся
                    if (window.location.href.includes('/applicant/vacancy_response')) {
                        window.history.back();
                        await bot.waitForButtons(5000);
                    }
                    return null;
                }

                if (await bot.checkAndCloseDirectResponseModal(o)) {
                    bot.stats.skipped++;
                    if (vacancyId) bot.addSkippedVacancy('id_' + vacancyId);
                    bot.updateStatsDisplay();
                    return null;
                }

                await bot.wait(300 + Math.random() * 300);
                bot.resumeSelectedFlag = false;
                // [NEW] Выбираем вариант письма до отправки — он попадёт в журнал
                // и потом свяжется со статусом отклика в отчёте по конверсии.
                bot._currentLetter = bot._pickLetter();
                // Навыки, которые вакансия реально просит И которые есть у вас.
                // Подставляются в {навыки} — письмо называет ровно то, что нужно
                // этому работодателю, и ничего сверх вашего же списка.
                bot._currentSkills = bot._matchedSkills(b);
                // Уточняем по странице вакансии: keySkills точнее сниппета,
                // а письмо получает ровно те навыки, что работодатель перечислил.
                if (bot.settings.deepMatch && bot.mySkills.length) {
                    const deep = await bot._deepSkills(vacancyId);
                    if (deep && deep.matched.length) bot._currentSkills = deep.matched;
                }
                // hh.ru отклоняет отклик без письма, если работодатель отметил его
                // обязательным (@responseLetterRequired). Раньше при выключенном
                // сопроводительном такие вакансии молча уходили в «ошибка».
                const ok = await bot.processResponse(o, 0, vacancyTitle, !!(meta && meta.letterRequired));

                if (ok === 'ALREADY_REJECTED') {
                    bot.stats.skipped++;
                    if (vacancyId) bot.addSkippedVacancy('id_' + vacancyId);
                    if (o && bot.settings.autoRememberOrganizations) bot.addToAutoFilter(o);
                    bot.updateStatsDisplay();
                    await bot.closeModal();
                    return null;
                }
                if (ok === 'RESUME_HIDDEN') {
                    bot.stats.skipped++;
                    if (vacancyId) bot.addSkippedVacancy('id_' + vacancyId);
                    bot.updateStatsDisplay();
                    bot.updateStatus('\u26A0\uFE0F Резюме скрыто от этого работодателя.\nhh.ru \u2192 Резюме \u2192 Видимость: «Видно компаниям-клиентам HeadHunter»');
                    await bot.closeModal();
                    return null;
                }
                if (ok === 'DIRECT_RESPONSE') {
                    bot.stats.skipped++;
                    if (vacancyId) bot.addSkippedVacancy('id_' + vacancyId);
                    bot.updateStatsDisplay();
                    await bot.closeModal();
                    return null;
                }

                if (ok) {
                    bot.consecutiveErrors = 0;
                    bot.stats.success++;
                    bot._bumpDaily();
                    bot._logResponse(vacancyId, employerId, o, vacancyTitle, meta);
                    // [FIX] Добавляем в автофильтр после успешного отклика —
                    // раньше addToAutoFilter вызывался только для прямых откликов и тестов
                    if (o && bot.settings.autoRememberOrganizations) bot.addToAutoFilter(o);
                } else {
                    bot.consecutiveErrors++;
                    bot.stats.failed++;
                }
                bot.updateStatsDisplay();
                await bot.closeModal();
                // [FIX url redirect] Проверяем URL после отклика — возвращаемся если ушли
                if (window.location.href.includes('/applicant/vacancy_response')) {
                    window.history.back();
                    await bot.waitForButtons(5000);
                }
                return ok;
            }

            async _waitForModal(timeoutMs) {
                // [FIX] Добавлен [role="dialog"][aria-modal="true"] — именно такую роль
                // имеет форма отклика hh.ru (alertdialog используется только для алертов),
                // а мёртвый vacancy-response-popup-close заменён на актуальный.
                const selectors = [
                    '[data-qa="vacancy-response-submit-popup"]',
                    '[role="dialog"][aria-modal="true"]',
                    '[role="alertdialog"][aria-modal="true"]',
                    '[data-qa="response-popup-close"]',
                    '[data-qa="vacancy-response-popup-form-letter-input"]'
                ];
                const start = Date.now();
                while (Date.now() - start < timeoutMs) {
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (this._isVisible(el)) return true;
                    }
                    await this.wait(100);
                }
                return false;
            }

            // [NEW] Уведомление через chrome.notifications при завершении
            async _sendNotification(title, message) {
                try {
                    // [FIX] sendMessage возвращает промис: если service worker спит или
                    // расширение перезагружено, «Receiving end does not exist» всплывал
                    // как unhandledrejection — try/catch вокруг синхронного вызова его не ловил.
                    const r = chrome.runtime.sendMessage({ action: 'showNotification', title, message });
                    if (r && typeof r.catch === 'function') r.catch(() => {});
                } catch(e) {}
            }

            // ═══ ОЧЕРЕДЬ ПОИСКОВЫХ ЗАПРОСОВ ═══
            // Один запрос с включёнными фильтрами выдыхается быстро: в замере
            // «не более 50 откликов» оставило 5 вакансий из 50. До суточных 200
            // на одном поиске не добраться, поэтому бот идёт по списку URL.
            // ═══ ОПТИМИЗАТОР ПОИСКОВОГО URL ═══
            // Переносит фильтры на сторону hh.ru. Параметры сняты из searchClusters
            // самой выдачи и проверены запросами: order_by=publication_time,
            // label=not_from_agency | accredited_it | low_performance | with_salary,
            // work_format, experience (перечислением), salary + only_with_salary,
            // search_period. Клиентские фильтры остаются для того, чего у hh.ru нет:
            // навыки, точный порог конкуренции, тесты, чёрный список работодателей.
            _optimizeUrl(rawUrl) {
                let u;
                try { u = new URL(rawUrl, location.href); } catch(e) { return rawUrl; }
                const host = u.hostname.toLowerCase();
                if (host !== 'hh.ru' && !host.endsWith('.hh.ru')) return rawUrl;
                if (!/\/search\/vacancy/.test(u.pathname)) return rawUrl;

                const s = this.settings;
                const p = u.searchParams;
                const labels = new Set(p.getAll('label'));

                if (s.orderByFresh) p.set('order_by', 'publication_time');
                if (s.searchInTitleOnly && p.get('text')) p.set('search_field', 'name');
                if (s.labelNoAgency) labels.add('not_from_agency');
                if (s.labelAccreditedIt) labels.add('accredited_it');
                if (s.labelLowPerformance) labels.add('low_performance');

                if (s.serverSideFilters) {
                    if (s.salaryRequired) labels.add('with_salary');
                    if (s.minSalary > 0) {
                        p.set('salary', String(s.minSalary));
                        p.set('only_with_salary', 'true');
                    }
                    if (s.workFormat === 'remote') { p.delete('work_format'); p.append('work_format', 'REMOTE'); }
                    else if (s.workFormat === 'on_site') { p.delete('work_format'); p.append('work_format', 'ON_SITE'); }
                    else if (s.workFormat === 'remote_hybrid') {
                        p.delete('work_format');
                        p.append('work_format', 'REMOTE');
                        p.append('work_format', 'HYBRID');
                    }
                    if (s.maxAgeDays > 0) p.set('search_period', String(Math.min(30, s.maxAgeDays)));
                    if (s.maxExperience !== 'any') {
                        // «не выше» — перечисляем все допустимые уровни, hh.ru
                        // складывает одноимённые параметры по ИЛИ (проверено).
                        const order = ['noExperience', 'between1And3', 'between3And6', 'moreThan6'];
                        const lim = order.indexOf(s.maxExperience);
                        if (lim >= 0) {
                            p.delete('experience');
                            order.slice(0, lim + 1).forEach(v => p.append('experience', v));
                        }
                    }
                }

                if (labels.size) { p.delete('label'); [...labels].forEach(v => p.append('label', v)); }
                p.delete('page');
                p.delete('search_session_id');
                u.search = p.toString();
                return u.toString();
            }

            // Сравнение без служебных параметров — порядок ключей у hh.ru свой.
            _normQuery(url) {
                try {
                    const x = new URL(url, location.href);
                    const p = new URLSearchParams(x.search);
                    ['page', 'search_session_id', 'hhtmFrom', 'hhtmFromLabel', 'customDomain'].forEach(k => p.delete(k));
                    return x.pathname + '?' + JSON.stringify([...p.entries()].sort());
                } catch(e) { return String(url); }
            }

            // Возвращает true, если увела вкладку на оптимизированный адрес.
            async _applyUrlOptimization() {
                const cur = location.href.split('#')[0];
                const opt = this._optimizeUrl(cur);
                if (this._normQuery(opt) === this._normQuery(cur)) return false;
                // Защита от петли: если по этому же запросу уже переходили — не повторяем.
                let guard = '';
                try { guard = sessionStorage.getItem('hh-opt-done') || ''; } catch(e) {}
                if (guard === this._normQuery(opt)) return false;
                try { sessionStorage.setItem('hh-opt-done', this._normQuery(opt)); } catch(e) {}
                try { sessionStorage.setItem('hh-auto-restart', '1'); } catch(e) {}
                this.updateStatus('Оптимизирую поиск (свежие вперёд, фильтры на стороне hh.ru)...');
                this.saveSettings();
                await this.wait(1200);
                location.href = opt;
                return true;
            }

            optimizeSearchManually() {
                const cur = location.href.split('#')[0];
                const opt = this._optimizeUrl(cur);
                if (this._normQuery(opt) === this._normQuery(cur)) {
                    this.updateStatus('Поиск уже оптимизирован \u2705');
                    return;
                }
                try { sessionStorage.removeItem('hh-auto-restart'); } catch(e) {}
                this.updateStatus('Перехожу на оптимизированный поиск...');
                setTimeout(() => { location.href = opt; }, 600);
            }

            _sameSearch(a, b) {
                try {
                    const ua = new URL(a, location.href), ub = new URL(b, location.href);
                    if (ua.hostname !== ub.hostname || ua.pathname !== ub.pathname) return false;
                    // page и служебные метки меняются при пагинации — их не сравниваем
                    const strip = (u) => {
                        const p = new URLSearchParams(u.search);
                        ['page', 'search_session_id', 'hhtmFrom', 'hhtmFromLabel', 'customDomain'].forEach(k => p.delete(k));
                        return JSON.stringify([...p.entries()].sort());
                    };
                    return strip(ua) === strip(ub);
                } catch(e) { return false; }
            }

            async _advanceSearchQueue() {
                const q = (this.searchQueue || [])
                    .map(u => String(u || '').trim())
                    .filter(u => /^https?:\/\/([a-z0-9-]+\.)*hh\.ru\//i.test(u));
                if (!q.length) return false;
                const cur = location.href.split('#')[0];
                const idx = q.findIndex(u => this._sameSearch(u, cur));
                let next = null;
                if (idx < 0) next = q[0];                       // текущий поиск не из очереди — начинаем с первого
                else if (idx + 1 < q.length) next = q[idx + 1];  // следующий
                if (!next) return false;                         // очередь пройдена
                this.updateStatus('Запрос исчерпан → перехожу к поиску ' + (idx < 0 ? 1 : idx + 2) + ' из ' + q.length);
                this.saveSettings();
                try { sessionStorage.setItem('hh-auto-restart', '1'); } catch(e) {}
                await this.wait(1500);
                try { sessionStorage.removeItem('hh-opt-done'); } catch(e) {}
                location.href = this._optimizeUrl(next);
                return true;
            }

            async startAutoProcess() {
                tryRestoreBot();
                const bot = window.hhAutoResponder || this;
                if (bot.isRunning) return;
                if (window.location.href.includes('/applicant/vacancy_response')) { bot.updateStatus('Перейдите на страницу поиска'); return; }
                // [NEW] Стоп-кран на шаблоне. Письмо по умолчанию содержит плейсхолдер
                // «[Ваше Имя]», и запуск «как есть» отправлял его сотне работодателей
                // за один прогон — откатить такое нельзя. Проверяем до первого клика.
                if (!bot.settings.skipCoverLetter) {
                    const ph = String(bot.coverLetter || '').match(/\[[^\]]{0,40}\]/)
                            || String(bot.coverLetterB || '').match(/\[[^\]]{0,40}\]/);
                    if (ph) {
                        bot.updateStatus('\u26A0\uFE0F В письме остался шаблон ' + ph[0] +
                            '\nОтредактируйте письмо или снимите галочку «Отправлять сопроводительное».');
                        return;
                    }
                    if (!String(bot.coverLetter || '').trim()) {
                        bot.updateStatus('\u26A0\uFE0F Письмо пустое. Заполните его или отключите отправку письма.');
                        return;
                    }
                }
                // Переносим фильтры в URL до начала прогона: страница перезагрузится
                // уже отфильтрованной сервером, и бот продолжит по флагу автозапуска.
                if (await bot._applyUrlOptimization()) return;
                bot.isRunning = true;
                bot.consecutiveErrors = 0;
                bot._lastErrorPauseAt = 0;
                bot._logSessionStart();
                const pageMatch = window.location.href.match(/[?&]page=(\d+)/);
                bot.currentPage = pageMatch ? parseInt(pageMatch[1]) + 1 : 1;
                bot.updateControlButtons();
                bot.updateStatus('Запуск...');
                try {
                    while (bot.isRunning) {
                        await bot.smartDelay();

                        await bot.waitForButtons(8000);
                        // Один запрос на страницу — до перебора вакансий, чтобы
                        // тестовые отсеялись ещё на этапе сбора кнопок.
                        await bot._loadVacancyMeta().catch(() => {});
                        const bt = bot.getAvailableButtons();

                        if (!bt.length) {
                            const allBtns = document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]');
                            const visibleBtns = Array.from(allBtns).filter(b => bot._isVisible(b) && b.style.display !== 'none');
                            if (allBtns.length > 0 && visibleBtns.length > 0) {
                                const testCnt = visibleBtns.filter(b => { const m = bot._metaFor(bot.getVacancyId(b)); return m && m.test; }).length;
                                bot.updateStatus('Стр.' + bot.currentPage + ' | Все ' + visibleBtns.length + ' отфильтрованы/пропущены'
                                    + (testCnt ? ' (с тестовым: ' + testCnt + ')' : ''));
                            } else {
                                bot.updateStatus('Стр.' + bot.currentPage + ' | Все обработаны');
                            }
                            if (bot.settings.autoNextPage) {
                                const n = document.querySelector('[data-qa="pager-next"]');
                                if (n) {
                                    bot.currentPage++;
                                    bot.updateStatus('Переход на стр. ' + bot.currentPage + '...');
                                    n.click();
                                    await bot.wait(500);
                                    await bot.waitForButtons(10000);
                                    continue;
                                }
                            }
                            const summary = '✅' + bot.stats.success + ' ❌' + bot.stats.failed + ' ⏭️' + bot.stats.skipped;
                            // Страницы кончились — пробуем следующий поиск из очереди.
                            // Метод сам уводит вкладку и ставит флаг автозапуска.
                            if (await bot._advanceSearchQueue()) return;
                            bot.updateStatus('Завершено! ' + summary);
                            bot._sendNotification('HH Авто-отклик завершён', summary);
                            bot.saveSettings();
                            break;
                        }

                        for (let i = 0; i < bt.length && bot.isRunning; i++) {
                            const _result = await bot.processSingleVacancy(bt[i], i, bt.length);

                            if (bot._looksBlocked()) {
                                bot.updateStatus('🛑 hh.ru показал проверку (капча/блокировка). Бот остановлен.\nПройдите проверку вручную и запустите заново.');
                                bot._sendNotification('HH Авто-отклик остановлен', 'hh.ru показал проверку — нужно вмешательство');
                                bot.stopAutoProcess();
                                return;
                            }
                            if (bot.consecutiveErrors >= 8) {
                                bot.updateStatus('Слишком много ошибок — перезагрузка...');
                                bot.saveSettings();
                                try { sessionStorage.setItem('hh-auto-restart', '1'); } catch(e) {}
                                await bot.wait(2000);
                                window.location.reload();
                                return;
                            }
                            // [FIX] Счётчик обнулялся на трёх ошибках, поэтому до 8 он не
                            // доходил никогда и ветка с перезагрузкой выше была мёртвой.
                            // Теперь пауза делается на каждой третьей ошибке подряд,
                            // а обнуляет счётчик только успешный отклик.
                            if (bot.consecutiveErrors === 0) bot._lastErrorPauseAt = 0;
                            if (bot.consecutiveErrors > 0 && bot.consecutiveErrors % 3 === 0 &&
                                bot._lastErrorPauseAt !== bot.consecutiveErrors) {
                                bot._lastErrorPauseAt = bot.consecutiveErrors;
                                bot.updateStatus('⚠️ ' + bot.consecutiveErrors + ' ошибок подряд — пауза 30с...');
                                await bot.wait(30000);
                            }
                            if (_result !== null && i < bt.length - 1 && bot.isRunning) await bot.smartDelay();
                        }
                        await bot.wait(300 + Math.random() * 300);
                    }
                } catch(e) {
                    console.error(e);
                } finally {
                    bot.stopAutoProcess();
                }
            }

            stopAutoProcess() {
                const bot = window.hhAutoResponder || this;
                const wasRunning = bot.isRunning;
                bot.isRunning = false;
                bot._lastErrorPauseAt = 0;
                bot.updateControlButtons();
                if (wasRunning) {
                    bot._logSessionEnd();
                    bot.updateStatus('Остановлено | Стр.' + bot.currentPage + ' ✅' + bot.stats.success + ' ❌' + bot.stats.failed + ' ⏭️' + bot.stats.skipped);
                    bot.saveSettings();
                }
            }

            async testProcess() {
                tryRestoreBot();
                const bot = window.hhAutoResponder || this;
                if (bot.isRunning) return;
                await bot._loadVacancyMeta().catch(() => {});
                const bt = bot.getAvailableButtons();
                if (!bt.length) { bot.updateStatus('Нет доступных вакансий на странице'); return; }
                bot.isRunning = true;
                bot.updateControlButtons();
                try {
                    await bot.processSingleVacancy(bt[0], 0, 1);
                } finally {
                    bot.isRunning = false;
                    bot.updateControlButtons();
                    bot.updateStatus('Тест завершён');
                }
            }

            createInterface() {
                document.getElementById('hh-auto-panel')?.remove();
                document.getElementById('hh-toggle-btn')?.remove();
                this._eventListeners = [];
                this.panel = window.__HH_UI__.createPanel(this);
                document.body.appendChild(this.panel);
                this.toggleButton = window.__HH_UI__.createToggleButton(this);
                document.body.appendChild(this.toggleButton);
                this.updateCount();
                this.updateStatsDisplay();
            }

            setupEventListeners() {
                this._eventListeners.forEach(({ el, type, handler }) => { if (el) el.removeEventListener(type, handler); });
                this._eventListeners = [];

                const $ = id => { const el = document.getElementById(id); if (!el) console.warn('UI: элемент не найден:', id); return el; };
                const addListener = (el, type, handler) => { if (!el) return; el.addEventListener(type, handler); this._eventListeners.push({ el, type, handler }); };

                addListener(this.toggleButton, 'click', () => { this.panel.style.display = this.panel.style.display === 'none' ? 'block' : 'none'; });
                addListener($('hh-close-btn'), 'click', () => { this.panel.style.display = 'none'; });
                // [NEW] Одна делегированная обработка всех секций: заголовки
                // рендерятся заново при каждой перерисовке панели, а слушатель
                // висит на самой панели и переживает перерисовку тела.
                addListener(this.panel, 'click', (e) => {
                    const tab = e.target && e.target.closest ? e.target.closest('.hhx-tab') : null;
                    if (!tab || !this.panel.contains(tab)) return;
                    const key = tab.getAttribute('data-sec');
                    if (!key) return;
                    this.activeTab = key;
                    this.panel.querySelectorAll('.hhx-pane').forEach(p => {
                        p.style.display = (p.getAttribute('data-sec-body') === key) ? '' : 'none';
                    });
                    this.panel.querySelectorAll('.hhx-tab').forEach(t => {
                        t.classList.toggle('hhx-tab-on', t.getAttribute('data-sec') === key);
                    });
                    this.debouncedSave();
                });
                addListener($('hh-theme-slider'), 'click', () => { this.toggleTheme(); this.createInterface(); this.setupEventListeners(); });
                addListener($('hh-start'), 'click', () => { tryRestoreBot(); (window.hhAutoResponder || this).startAutoProcess(); });
                addListener($('hh-test'), 'click', () => this.testProcess());
                addListener($('hh-stop'), 'click', () => this.stopAutoProcess());
                addListener($('hh-analyze'), 'click', () => this.analyzePage());
                addListener($('hh-test-filter'), 'click', () => this.testFilter());
                addListener($('hh-show-auto-filter'), 'click', () => this.showAutoFilter());
                addListener($('hh-clear'), 'click', () => this.clearHistory());
                addListener($('hh-clear-auto-filter'), 'click', () => this.clearAutoFilter());
                // [NEW] Кнопки экспорта/импорта/лога
                addListener($('hh-export'), 'click', () => this.exportData());
                addListener($('hh-import'), 'click', () => this.importData());
                addListener($('hh-session-log'), 'click', () => this.showSessionLog());
                addListener($('hh-skip-cover-letter'), 'change', e => {
                    this.settings.skipCoverLetter = e.target.checked; this.saveSettings();
                    const ta = $('hh-letter'); if (ta) { ta.style.opacity = e.target.checked ? '0.5' : '1'; ta.style.pointerEvents = e.target.checked ? 'none' : 'auto'; }
                    this.updateStatus(e.target.checked ? 'Письмо ОТКЛЮЧЕНО' : 'Письмо ВКЛЮЧЕНО');
                });
                addListener($('hh-auto-select-resume'), 'change', e => { this.settings.autoSelectResume = e.target.checked; this.debouncedSave(); this.updateStatus(e.target.checked ? 'Автовыбор ВКЛЮЧЕН' : 'Автовыбор ВЫКЛЮЧЕН'); });
                addListener($('hh-resume-matching'), 'input', e => { this.settings.resumeTitleMatching = clampNum(e.target.value, 0, 100, 70, true); const mv = $('hh-matching-value'); if (mv) mv.textContent = this.settings.resumeTitleMatching + '%'; this.debouncedSave(); });
                addListener($('hh-auto-remember'), 'change', e => { this.settings.autoRememberOrganizations = e.target.checked; this.debouncedSave(); this.updateCount(); this.updateStatus(e.target.checked ? 'АВТОфильтр ВКЛЮЧЕН' : 'АВТОфильтр выключен'); });
                addListener($('hh-letter'), 'input', e => {
                    // [FIX] Счётчик обещает лимит 2000, но обрезки не было — hh.ru
                    // отклонял отклик с длинным письмом, а бот считал это ошибкой.
                    if (e.target.value.length > 2000) e.target.value = e.target.value.slice(0, 2000);
                    this.coverLetter = e.target.value;
                    const cc = $('hh-char-count'); if (cc) cc.textContent = e.target.value.length + '/2000';
                    clearTimeout(this._saveTimer);
                    this._saveTimer = setTimeout(() => this.saveSettings(), 500);
                });
                addListener($('hh-auto-next'), 'change', e => { this.settings.autoNextPage = e.target.checked; this.debouncedSave(); });
                addListener($('hh-skip-responded'), 'change', e => { this.settings.skipResponded = e.target.checked; this.debouncedSave(); this.updateCount(); });
                addListener($('hh-filter-organizations'), 'change', e => { this.settings.filterOrganizations = e.target.checked; this.debouncedSave(); this.updateCount(); });
                // [FIX] min/max у input'а браузер не навязывает при ручном вводе —
                // раньше сюда проходили и 100 секунд, и 0.001. Зажимаем и возвращаем в поле.
                addListener($('hh-delay'), 'change', e => { this.settings.delay = clampNum(e.target.value, 0.3, 5, 0.5); e.target.value = this.settings.delay; this.debouncedSave(); });
                addListener($('hh-filter-text'), 'input', e => { this.filteredOrganizations = e.target.value.split(',').map(o => o.trim()).filter(o => o); this.debouncedSave(); this._debouncedCount(); });
                addListener($('hh-title-stopwords'), 'input', e => { this.titleStopWords = e.target.value.split(',').map(o => o.trim()).filter(o => o); this.debouncedSave(); this._debouncedCount(); });
                // [NEW] Ночной режим
                addListener($('hh-night-mode'), 'change', e => {
                    this.settings.nightModeEnabled = e.target.checked;
                    const hrs = document.getElementById('hh-night-hours');
                    if (hrs) hrs.style.display = e.target.checked ? 'flex' : 'none';
                    this.debouncedSave();
                    this.updateStatus(e.target.checked ? '\uD83C\uDF19 Ночной режим включён' : 'Ночной режим выключен');
                });
                addListener($('hh-night-from'), 'change', e => { this.settings.nightModeFrom = clampNum(e.target.value, 0, 23, 23, true); e.target.value = this.settings.nightModeFrom; this.debouncedSave(); });
                addListener($('hh-night-to'),   'change', e => { this.settings.nightModeTo   = clampNum(e.target.value, 0, 23, 8,  true); e.target.value = this.settings.nightModeTo;   this.debouncedSave(); });
                addListener($('hh-random-skip'), 'change', e => { this.settings.randomSkipPercent = clampNum(e.target.value, 0, 50, 5, true); e.target.value = this.settings.randomSkipPercent; this.debouncedSave(); });
                // [NEW] Фильтры вакансии
                // Меняются только настройки фильтра, сами данные вакансий те же —
                // перезапрашивать страницу незачем, достаточно пересчитать счётчик.
                const reFilter = () => this.updateCount();
                addListener($('hh-sort-competition'), 'change', e => { this.settings.sortByCompetition = e.target.checked; this.debouncedSave(); });
                addListener($('hh-max-competitors'), 'change', e => { this.settings.maxCompetitors = clampNum(e.target.value, 0, 100000, 0, true); e.target.value = this.settings.maxCompetitors; this.debouncedSave(); reFilter(); });
                addListener($('hh-min-salary'), 'change', e => { this.settings.minSalary = clampNum(e.target.value, 0, 100000000, 0, true); e.target.value = this.settings.minSalary; this.debouncedSave(); reFilter(); });
                addListener($('hh-salary-required'), 'change', e => { this.settings.salaryRequired = e.target.checked; this.debouncedSave(); reFilter(); });
                addListener($('hh-work-format'), 'change', e => { this.settings.workFormat = e.target.value; this.debouncedSave(); reFilter(); });
                addListener($('hh-max-experience'), 'change', e => { this.settings.maxExperience = e.target.value; this.debouncedSave(); reFilter(); });
                addListener($('hh-max-age'), 'change', e => { this.settings.maxAgeDays = clampNum(e.target.value, 0, 365, 0, true); e.target.value = this.settings.maxAgeDays; this.debouncedSave(); reFilter(); });
                addListener($('hh-skip-internship'), 'change', e => { this.settings.skipInternship = e.target.checked; this.debouncedSave(); reFilter(); });
                addListener($('hh-title-required'), 'input', e => { this.titleRequiredWords = e.target.value.split(',').map(o => o.trim()).filter(o => o); this.debouncedSave(); this._debouncedCount(); });
                addListener($('hh-letter-b'), 'input', e => {
                    if (e.target.value.length > 2000) e.target.value = e.target.value.slice(0, 2000);
                    this.coverLetterB = e.target.value;
                    const cc = $('hh-char-count-b'); if (cc) cc.textContent = e.target.value.length + '/2000';
                    this.debouncedSave();
                });
                addListener($('hh-my-skills'), 'input', e => { this.mySkills = e.target.value.split(',').map(o => o.trim()).filter(o => o); this._skillCache = new Map(); this.debouncedSave(); this._debouncedCount(); });
                addListener($('hh-min-skill-match'), 'change', e => { this.settings.minSkillMatch = clampNum(e.target.value, 0, 20, 0, true); e.target.value = this.settings.minSkillMatch; this.debouncedSave(); this.updateCount(); });
                addListener($('hh-min-rating'), 'change', e => { this.settings.minEmployerRating = clampNum(e.target.value, 0, 5, 0); e.target.value = this.settings.minEmployerRating; this.debouncedSave(); this.updateCount(); });
                addListener($('hh-min-review-rate'), 'change', e => { this.settings.minReviewRate = clampNum(e.target.value, 0, 100, 0, true); e.target.value = this.settings.minReviewRate; this.debouncedSave(); this.updateCount(); });
                addListener($('hh-prefer-online'), 'change', e => { this.settings.preferManagerOnline = e.target.checked; this.debouncedSave(); });
                addListener($('hh-only-online'), 'change', e => { this.settings.onlyManagerOnline = e.target.checked; this.debouncedSave(); this.updateCount(); });
                addListener($('hh-max-repost'), 'change', e => { this.settings.maxRepostDays = clampNum(e.target.value, 0, 365, 0, true); e.target.value = this.settings.maxRepostDays; this.debouncedSave(); this.updateCount(); });
                addListener($('hh-min-reviews'), 'change', e => { this.settings.minReviewsForRating = clampNum(e.target.value, 1, 100, 3, true); e.target.value = this.settings.minReviewsForRating; this.debouncedSave(); this.updateCount(); });
                addListener($('hh-deep-match'), 'change', e => { this.settings.deepMatch = e.target.checked; this.debouncedSave(); this.updateStatus(e.target.checked ? 'Точное сопоставление включено (+~0.8 с на вакансию)' : 'Точное сопоставление выключено'); });
                addListener($('hh-sort-skills'), 'change', e => { this.settings.sortBySkills = e.target.checked; this.debouncedSave(); });
                addListener($('hh-search-queue'), 'input', e => { this.searchQueue = e.target.value.split('\n').map(o => o.trim()).filter(o => o); this.debouncedSave(); });
                addListener($('hh-title-only'), 'change', e => { this.settings.searchInTitleOnly = e.target.checked; this.debouncedSave(); });
                addListener($('hh-order-fresh'), 'change', e => { this.settings.orderByFresh = e.target.checked; this.debouncedSave(); });
                addListener($('hh-no-agency'), 'change', e => { this.settings.labelNoAgency = e.target.checked; this.debouncedSave(); });
                addListener($('hh-accredited-it'), 'change', e => { this.settings.labelAccreditedIt = e.target.checked; this.debouncedSave(); });
                addListener($('hh-low-performance'), 'change', e => { this.settings.labelLowPerformance = e.target.checked; this.debouncedSave(); });
                addListener($('hh-server-filters'), 'change', e => { this.settings.serverSideFilters = e.target.checked; this.debouncedSave(); });
                addListener($('hh-optimize-search'), 'click', () => this.optimizeSearchManually());
                addListener($('hh-bump-resume'), 'click', () => this.bumpResumes(false));
                addListener($('hh-import-autosearch'), 'click', () => this.importSavedSearches());
                addListener($('hh-blacklist-hh'), 'click', () => this.blacklistFilteredEmployers());
                addListener($('hh-auto-bump'), 'change', e => { this.settings.autoBumpResume = e.target.checked; this.debouncedSave(); this._startBumpWatcher(); this.updateStatus(e.target.checked ? 'Автоподнятие резюме включено (раз в 4 ч)' : 'Автоподнятие выключено'); });
                addListener($('hh-favorite-tests'), 'change', e => { this.settings.favoriteSkippedTests = e.target.checked; this.debouncedSave(); });
                addListener($('hh-notify-invites'), 'change', e => { this.settings.notifyInvites = e.target.checked; this.debouncedSave(); this._startInviteWatcher(); this.updateStatus(e.target.checked ? 'Уведомления о приглашениях включены' : 'Уведомления выключены'); });
                addListener($('hh-conversion'), 'click', () => this.showConversion());
                addListener($('hh-export-csv'), 'click', () => this.exportResponsesCsv());

                if (this._updateCountInterval) clearInterval(this._updateCountInterval);
                this._updateCountInterval = setInterval(() => this.updateCount(), 5000);
            }

            toggleTheme() { this.theme = this.theme === 'dark' ? 'light' : 'dark'; this.saveSettings(); }

            updateStatus(m) {
                const el = document.getElementById('hh-status');
                if (el) { el.textContent = m; el.style.whiteSpace = 'pre-line'; el.style.fontSize = m.length > 50 ? '11px' : '13px'; }
            }

            updateStatsDisplay() {
                const el = document.getElementById('hh-stats');
                if (!el) return;
                const used = this._dailyCount();
                const left = Math.max(0, 198 - used);
                // Счётчики сессии и суточный лимит разведены: лимит показывает
                // отдельная полоса под метриками, дублировать его здесь незачем —
                // строка не помещалась и переносилась на две.
                el.textContent = '✅' + this.stats.success + '  ❌' + this.stats.failed + '  ⏭️' + this.stats.skipped;
                const qt = document.getElementById('hh-quota-text');
                if (qt) qt.textContent = used + ' / 198';
                const qb = document.getElementById('hh-quota-bar');
                if (qb) qb.style.width = Math.min(100, Math.round(used / 198 * 100)) + '%';
                el.title = left <= 10 ? 'Суточный лимит hh.ru почти исчерпан' : '';
                this.debouncedSave();
            }

            // [FIX залипший счётчик] Текстовые фильтры (организации, стоп-слова,
            // белый список) меняли состояние, но счётчик «Найдено» не трогали и
            // ждали 5-секундный интервал — цифра всё это время врала. Остальные
            // фильтры пересчитывают сразу, теперь и эти. Дебаунс, потому что
            // событие input прилетает на каждый символ, а пересчёт обходит все
            // карточки выдачи.
            _debouncedCount() {
                clearTimeout(this._countTimer);
                this._countTimer = setTimeout(() => this.updateCount(), 300);
            }

            updateCount() {
                const el = document.getElementById('hh-count');
                if (!el) return;
                if (this.isRunning) return;
                // Панель свёрнута — считать нечего и некому показывать.
                // getAvailableButtons() обходит все 50 карточек с DOM-запросами,
                // и раз в 5 секунд это заметно на слабой машине.
                if (this.panel && this.panel.style.display === 'none') return;
                el.textContent = this.getAvailableButtons().length;
            }

            updateControlButtons() {
                const s = document.getElementById('hh-start'), t = document.getElementById('hh-test'), p = document.getElementById('hh-stop');
                const tb = document.getElementById('hh-toggle-btn');
                if (tb && tb !== this.toggleButton) this.toggleButton = tb;
                if (this.isRunning) {
                    if (s) s.style.display = 'none'; if (t) t.style.display = 'none'; if (p) p.style.display = 'block';
                    if (this.toggleButton) { this.toggleButton.classList.add('hh-toggle-running'); this.toggleButton.classList.remove('hh-toggle-stopped'); this.toggleButton.textContent = '\u23F9\uFE0F'; }
                } else {
                    if (s) s.style.display = 'block'; if (t) t.style.display = 'block'; if (p) p.style.display = 'none';
                    if (this.toggleButton) { this.toggleButton.classList.add('hh-toggle-stopped'); this.toggleButton.classList.remove('hh-toggle-running'); this.toggleButton.textContent = '\uD83D\uDE80'; }
                }
            }

            testFilter() {
                const bt = document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]');
                let r = 'ТЕСТ ФИЛЬТРА:\n\n', f = 0;
                bt.forEach((b, i) => {
                    const o = this.getOrganizationNameFromCard(b);
                    let reason = null;
                    if (!this._isVisible(b) || b.style.display === 'none') {
                        reason = 'скрыта';
                    } else if (b.tagName === 'A' && (b.target === '_blank' || (b.href && !b.href.includes('/applicant/vacancy_response')))) {
                        reason = 'внешняя ссылка';
                    } else if (this.isFilteredOrganization(b)) {
                        reason = 'фильтр орг.';
                    } else if (this.isFilteredTitle(b)) {
                        reason = 'стоп-слово в названии';
                    } else if (!this.isRequiredTitle(b)) {
                        reason = 'нет обязательного слова в названии';
                    } else if (!this.isReviewRateOk(b)) {
                        const er = this.employerRates[String(this.getEmployerIdFromCard(b))];
                        reason = 'разбирает ' + (er ? er.rate : '?') + '% откликов';
                    } else if (!this.isRatingOk(b)) {
                        const rr = this._employerRating(b);
                        reason = 'рейтинг ' + (rr ? rr.rating : '?') + ' ниже ' + this.settings.minEmployerRating;
                    } else if (this._metaReject(this._metaFor(this.getVacancyId(b)))) {
                        reason = this._metaReject(this._metaFor(this.getVacancyId(b))) || 'фильтр вакансии';
                    } else {
                        const vid = this.getVacancyId(b);
                        if (vid && this.skippedVacancies.has('id_' + vid)) {
                            reason = 'пропущена';
                        } else {
                            const empId = this.getEmployerIdFromCard(b);
                            if (empId && this.testEmployerIds.has(String(empId))) {
                                reason = 'работодатель с тестом (id=' + empId + ')';
                            } else if (this.settings.skipResponded && this._isRespondedCard(b)) {
                                reason = 'уже откликнулись';
                            }
                        }
                    }
                    if (reason) f++;
                    r += (i + 1) + '. ' + (o || '???') + ' - ' + (reason ? 'ЗАБЛОКИРОВАНА (' + reason + ')' : 'РАЗРЕШЕНА') + '\n';
                });
                r += '\nИТОГО: ' + f + ' из ' + bt.length + ' вакансий заблокировано фильтром';
                this.updateStatus(r);
            }

            analyzePage() {
                const all = document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]');
                const visible = Array.from(all).filter(b => this._isVisible(b) && b.style.display !== 'none');
                this.updateStatus('АНАЛИЗ:\nВсего кнопок: ' + all.length + '\nВидимых: ' + visible.length + '\nДоступно: ' + this.getAvailableButtons().length + '\nСтр. ' + this.currentPage + '\n\u2705' + this.stats.success + ' \u274C' + this.stats.failed + ' \u23ED\uFE0F' + this.stats.skipped);
            }

            clearHistory() {
                this.stopAutoProcess();
                this.skippedVacancies.clear();
                this.testEmployerIds.clear();
                Store.remove(['hh-skipped-vacancies', 'hh-test-employers']);
                this.stats = { success: 0, failed: 0, skipped: 0 };
                // dailyStats НЕ сбрасываем: суточный лимит держит hh.ru, а не бот,
                // и обнуление счётчика привело бы к отправке сверх лимита и ошибкам.
                this.currentPage = 1;
                this.consecutiveErrors = 0;
                this._lastErrorPauseAt = 0;
                this.updateStatsDisplay();
                this.updateStatus('Всё очищено. Бот остановлен.');
            }
        }

        if (!window.__HH_MSG_LISTENER__) {
            try {
                chrome.runtime.onMessage.addListener((r, s, res) => {
                    if (r && r.action === 'checkConnection') {
                        res({ connected: !!window.hhAutoResponder || !!window.__hh_bot_instance__ });
                        return true;
                    }
                    // [FIX] Раньше true возвращался всегда: на любое другое сообщение
                    // ответ не приходил, и канал у отправителя висел до сборки мусора.
                    return false;
                });
                window.__HH_MSG_LISTENER__ = true;
            } catch(e) {}
        }

        let botInstance = null;

        function checkAutoRestart(bot) {
            try {
                const flag = sessionStorage.getItem('hh-auto-restart');
                if (flag === '1') {
                    sessionStorage.removeItem('hh-auto-restart');
                    setTimeout(() => {
                        if (bot && !bot.isRunning) {
                            bot.updateStatus('Автоперезапуск после перезагрузки...');
                            bot.startAutoProcess();
                        }
                    }, 2500);
                }
            } catch(e) {}
        }

        function initBot() {
            if (botInstance && !botInstance._reallyDestroyed) { botInstance.suspend(); botInstance.init(); checkAutoRestart(botInstance); return; }
            if (botInstance && typeof botInstance.destroy === 'function') botInstance.destroy();
            botInstance = new HHAutoResponder();
            // Конструктор уже публикует экземпляр в window ISOLATED-мира —
            // отдельная ветка «только под флагом отладки» была no-op и вводила в заблуждение.
            checkAutoRestart(botInstance);
        }

        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => setTimeout(initBot, 800)); }
        else { setTimeout(initBot, 800); }

        window.addEventListener('beforeunload', () => { if (botInstance && typeof botInstance.suspend === 'function') botInstance.suspend(); });
        window.addEventListener('popstate', () => { setTimeout(() => {
            if (botInstance && !botInstance._reallyDestroyed && !botInstance.isRunning) botInstance.init();
        }, 1000); });
    }).catch(e => console.error('HH AutoResponder init failed:', e));
})();