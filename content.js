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
        const VERSION = '2.4';
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
                    delay: 0.5,
                    filterOrganizations: true,
                    autoRememberOrganizations: true,
                    skipCoverLetter: false,
                    autoSelectResume: true,
                    resumeTitleMatching: 70,
                    // [NEW] Ночной режим — пауза по расписанию
                    nightModeEnabled: false,
                    nightModeFrom: 23,   // час начала паузы (0-23)
                    nightModeTo: 8       // час конца паузы (0-23)
                };
                this.filteredOrganizations = [];
                this.autoFilteredOrganizations = [];
                this.theme = 'dark';
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
                const W = window.__HH_WASM__;
                this.updateStatus('v' + VERSION + ' Готов' + (W ? ' [WASM]' : ' [JS]'));
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
                        if (Array.isArray(p.filteredOrganizations)) this.filteredOrganizations = p.filteredOrganizations;
                        if (Array.isArray(p.autoFilteredOrganizations)) this.autoFilteredOrganizations = p.autoFilteredOrganizations;
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
                        filteredOrganizations: this.filteredOrganizations,
                        autoFilteredOrganizations: this.autoFilteredOrganizations,
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
                                for (const k of ['autoNextPage','skipResponded','filterOrganizations',
                                                 'autoRememberOrganizations','skipCoverLetter',
                                                 'autoSelectResume','nightModeEnabled']) {
                                    merged[k] = !!merged[k];
                                }
                                this.settings = merged;
                            }
                            if (typeof data.coverLetter === 'string') this.coverLetter = data.coverLetter;
                            if (Array.isArray(data.filteredOrganizations)) this.filteredOrganizations = data.filteredOrganizations.filter(x => typeof x === 'string');
                            if (Array.isArray(data.autoFilteredOrganizations)) this.autoFilteredOrganizations = data.autoFilteredOrganizations.filter(x => typeof x === 'string');
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

            isLimitReached() {
                if (this.stats.success >= 198) return true;
                const lm = document.querySelector('[data-qa-popup-error-code="negotiations-limit-exceeded"]');
                if (this._isVisible(lm)) return true;
                const ue = document.querySelector('[data-qa-popup-error-code="unknown"]');
                if (this._isVisible(ue)) {
                    const t = ue.textContent || '';
                    if ((t.includes('не более 200') || t.includes('лимит') || t.includes('исчерпали')) && this.stats.success >= 190) return true;
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

            isFilteredOrganization(b) {
                if (!this.settings.filterOrganizations) return false;
                const o = this.getOrganizationNameFromCard(b);
                if (!o) return false;
                const ol = o.toLowerCase();
                for (const f of this.filteredOrganizations) { if (f && f.trim() && (ol.includes(f.toLowerCase()) || f.toLowerCase().includes(ol))) return true; }
                if (this.settings.autoRememberOrganizations) {
                    for (const f of this.autoFilteredOrganizations) { if (f && f.trim() && (ol.includes(f.toLowerCase()) || f.toLowerCase().includes(ol))) return true; }
                }
                return false;
            }

            addToAutoFilter(o) {
                if (!o || !this.settings.autoRememberOrganizations) return false;
                const ot = o.trim();
                if (!ot || this.autoFilteredOrganizations.some(x => x.toLowerCase() === ot.toLowerCase())) return false;
                this.autoFilteredOrganizations.push(ot);
                if (this.autoFilteredOrganizations.length > 1000) {
                    this.autoFilteredOrganizations.splice(0, this.autoFilteredOrganizations.length - 1000);
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
                                this.stats.success++;
                                this.updateStatsDisplay();
                                finish({ isTest: false, directResponse: true });
                                try { directLink.click(); } catch(e) {}
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

            async selectBestResume(vt) {
                if (!this.settings.autoSelectResume || !vt) return false;
                const op = await this.openResumeDropdown();
                if (!op) return false;
                await this.wait(500);
                try {
                    const rs = await this.getAllResumes();
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

            async submitResponse() {
                let sb = document.querySelector('[data-qa="vacancy-response-submit-popup"]:not([disabled])') || document.querySelector('[data-qa="vacancy-response-submit-popup"]');
                if (!sb) return false;
                if (sb.hasAttribute('disabled')) {
                    await this.wait(1000);
                    sb = document.querySelector('[data-qa="vacancy-response-submit-popup"]:not([disabled])') || document.querySelector('[data-qa="vacancy-response-submit-popup"]');
                    if (!sb || sb.hasAttribute('disabled')) return false;
                }
                sb.click();
                await this.wait(2000);
                return !this.isLimitReached();
            }

            async _processResponseInternal(o, depth, vacancyTitle) {
                if (depth > 5) return false;
                if (await this.checkAndCloseDirectResponseModal(o)) return 'DIRECT_RESPONSE';
                for (let i = 0; i < 3; i++) { await this.closeChatIfOpened(); await this.wait(300); }
                await this.wait(500);
                if (this.settings.autoSelectResume && !this.resumeSelectedFlag) {
                    const vt = vacancyTitle || this.getVacancyTitleFromModal();
                    if (vt) { await this.selectBestResume(vt); this.resumeSelectedFlag = true; await this.wait(500); }
                }
                const ta = document.querySelector('[data-qa="vacancy-response-popup-form-letter-input"]');
                if (ta) {
                    if (!this.settings.skipCoverLetter) {
                        const ns = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
                        if (ns) { ns.call(ta, this.coverLetter); ta.dispatchEvent(new Event('input', { bubbles: true })); }
                        else { ta.value = this.coverLetter; ta.dispatchEvent(new Event('input', { bubbles: true })); }
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
                if (al && !this.settings.skipCoverLetter) { al.click(); await this.wait(800); return await this._processResponseInternal(o, depth + 1, vacancyTitle); }
                const rl = document.querySelector('[data-qa="relocation-warning-confirm"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Все равно откликнуться'));
                if (rl) { rl.click(); await this.wait(800); return await this._processResponseInternal(o, depth + 1, vacancyTitle); }
                return await this.submitResponse();
            }

            async processResponse(o, depth = 0, vacancyTitle = null) {
                const TIMEOUT_MS = 15000;
                let timeoutId;
                const timeoutPromise = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS); });
                try {
                    const result = await Promise.race([this._processResponseInternal(o, depth, vacancyTitle), timeoutPromise]);
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
                return Array.from(document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]')).filter(b => {
                    if (!this._isVisible(b) || b.style.display === 'none') return false;
                    if (b.tagName === 'A' && (b.target === '_blank' || (b.href && !b.href.includes('/applicant/vacancy_response')))) return false;
                    if (this.isFilteredOrganization(b)) return false;
                    const vid = this.getVacancyId(b);
                    if (vid && this.skippedVacancies.has('id_' + vid)) return false;
                    const empId = this.getEmployerIdFromCard(b);
                    if (empId && this.testEmployerIds.has(String(empId))) return false;
                    if (this.settings.skipResponded && this._isRespondedCard(b)) return false;
                    return true;
                });
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
                if (vacancyId && bot.skippedVacancies.has('id_' + vacancyId)) return null;
                if (employerId && bot.testEmployerIds.has(String(employerId))) { bot.stats.skipped++; bot.updateStatsDisplay(); return null; }
                if (bot.settings.skipResponded && bot._isRespondedCard(b)) return null;

                // Случайный пропуск 5% вакансий — имитирует поведение реального пользователя
                if (Math.random() < 0.05) {
                    bot.stats.skipped++;
                    bot.updateStatsDisplay();
                    return null;
                }

                if (vacancyId) {
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
                const ok = await bot.processResponse(o, 0, vacancyTitle);

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

            async startAutoProcess() {
                tryRestoreBot();
                const bot = window.hhAutoResponder || this;
                if (bot.isRunning) return;
                if (window.location.href.includes('/applicant/vacancy_response')) { bot.updateStatus('Перейдите на страницу поиска'); return; }
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

                        const bt = await bot.waitForButtons(8000);

                        if (!bt.length) {
                            const allBtns = document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]');
                            const visibleBtns = Array.from(allBtns).filter(b => bot._isVisible(b) && b.style.display !== 'none');
                            if (allBtns.length > 0 && visibleBtns.length > 0) {
                                bot.updateStatus('Стр.' + bot.currentPage + ' | Все ' + visibleBtns.length + ' отфильтрованы/пропущены');
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
                            bot.updateStatus('Завершено! ' + summary);
                            bot._sendNotification('HH Авто-отклик завершён', summary);
                            bot.saveSettings();
                            break;
                        }

                        for (let i = 0; i < bt.length && bot.isRunning; i++) {
                            const _result = await bot.processSingleVacancy(bt[i], i, bt.length);

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
                const bt = bot.getAvailableButtons();
                if (!bt.length) return;
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
                addListener($('hh-settings-header'), 'click', () => this.toggleSettings());
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
                addListener($('hh-auto-remember'), 'change', e => { this.settings.autoRememberOrganizations = e.target.checked; this.debouncedSave(); this.updateStatus(e.target.checked ? 'АВТОфильтр ВКЛЮЧЕН' : 'АВТОфильтр выключен'); });
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
                addListener($('hh-skip-responded'), 'change', e => { this.settings.skipResponded = e.target.checked; this.debouncedSave(); });
                addListener($('hh-filter-organizations'), 'change', e => { this.settings.filterOrganizations = e.target.checked; this.debouncedSave(); });
                // [FIX] min/max у input'а браузер не навязывает при ручном вводе —
                // раньше сюда проходили и 100 секунд, и 0.001. Зажимаем и возвращаем в поле.
                addListener($('hh-delay'), 'change', e => { this.settings.delay = clampNum(e.target.value, 0.3, 5, 0.5); e.target.value = this.settings.delay; this.debouncedSave(); });
                addListener($('hh-filter-text'), 'input', e => { this.filteredOrganizations = e.target.value.split(',').map(o => o.trim()).filter(o => o); this.debouncedSave(); });
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

                if (this._updateCountInterval) clearInterval(this._updateCountInterval);
                this._updateCountInterval = setInterval(() => this.updateCount(), 5000);
            }

            toggleSettings() {
                this.settingsCollapsed = !this.settingsCollapsed;
                const c = document.getElementById('hh-settings-content');
                const a = document.getElementById('hh-settings-arrow');
                if (c) c.style.display = this.settingsCollapsed ? 'none' : 'block';
                if (a) a.textContent = this.settingsCollapsed ? '\u25B6' : '\u25BC';
            }

            toggleTheme() { this.theme = this.theme === 'dark' ? 'light' : 'dark'; this.saveSettings(); }

            updateStatus(m) {
                const el = document.getElementById('hh-status');
                if (el) { el.textContent = m; el.style.whiteSpace = 'pre-line'; el.style.fontSize = m.length > 50 ? '11px' : '13px'; }
            }

            updateStatsDisplay() {
                const el = document.getElementById('hh-stats');
                if (!el) return;
                el.textContent = '✅' + this.stats.success + ' ❌' + this.stats.failed + ' ⏭️' + this.stats.skipped;
                this.debouncedSave();
            }

            updateCount() {
                const el = document.getElementById('hh-count');
                if (!el) return;
                if (this.isRunning) return;
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