// ===== HH AUTO RESPONDER v2.2 — BOT LOGIC =====
(function() {
    'use strict';

    const _hn = window.location.hostname;
    if (_hn !== 'hh.ru' && !_hn.endsWith('.hh.ru')) return;
    if (window.top !== window.self) return; // не работаем в iframe

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

        function escapeFromTest() {
            if (window._hh_escaped) return;
            window._hh_escaped = true;
            const vid = window.location.href.match(/vacancyId=(\d+)/)?.[1];
            const empId = window.location.href.match(/employerId=(\d+)/)?.[1];
            if (empId) {
                try {
                    const testEmps = JSON.parse(localStorage.getItem('hh-test-employers') || '[]');
                    if (!testEmps.includes(empId)) {
                        testEmps.push(empId);
                        // FIX: ограничение размера массива — без cap рос бесконечно
                        if (testEmps.length > 500) testEmps.splice(0, testEmps.length - 500);
                        localStorage.setItem('hh-test-employers', JSON.stringify(testEmps));
                    }
                } catch(e) {}
            }
            if (vid) {
                try {
                    const skipped = JSON.parse(localStorage.getItem('hh-skipped-vacancies') || '[]');
                    if (!skipped.includes('id_' + vid)) {
                        skipped.push('id_' + vid);
                        // FIX: ограничение размера массива — без cap рос бесконечно
                        if (skipped.length > 500) skipped.splice(0, skipped.length - 500);
                        localStorage.setItem('hh-skipped-vacancies', JSON.stringify(skipped));
                    }
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
            // [FIX SPA race] isTestPage проверяется с задержкой — DOM обновляется не мгновенно
            // после popstate, без задержки возможен ложный детект теста на старом DOM
            setTimeout(() => {
                if (isTestPage()) { escapeFromTest(); return; }
                startObserver();
            }, 500);
        });
    })();

    // ───────────────────────────────────────────────────
    // БЛОК 2: ОЖИДАНИЕ ЯДРА
    // ───────────────────────────────────────────────────
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
        // FIX: console.log → console.debug (скрыт по умолчанию в DevTools); единая константа версии
        const VERSION = '2.2';
        console.debug('=== HH Авто-отклик v' + VERSION + ' ===');

        class HHAutoResponder {
            constructor() {
                this.coverLetter = "Добрый день! Заинтересовала ваша вакансия. Мой опыт соответствует требованиям. Готов(а) к собеседованию. С уважением, [Ваше Имя]";
                this.isRunning = false;
                this.skippedVacancies = new Set();
                this.testEmployerIds = new Set();
                this.stats = { success: 0, failed: 0, skipped: 0 };
                this.settings = {
                    autoNextPage: true,
                    skipResponded: true,
                    delay: 0.5,
                    filterOrganizations: true,
                    autoRememberOrganizations: true,
                    skipCoverLetter: false,
                    autoSelectResume: true,
                    resumeTitleMatching: 70
                };
                this.filteredOrganizations = [];
                this.autoFilteredOrganizations = [];
                this.theme = 'dark';
                this.resumeSelectedFlag = false;
                this.settingsCollapsed = true;
                this.consecutiveErrors = 0;
                this.iframeCheckInProgress = false;
                this.iframeCheckQueue = [];
                this._iframeMutex = Promise.resolve();
                this._updateCountInterval = null;
                this._eventListeners = [];
                this._reallyDestroyed = false;

                window.hhAutoResponder = this;
                window.__hh_bot_instance__ = this;
                this.init();
            }

            init() {
                if (this._updateCountInterval) { clearInterval(this._updateCountInterval); this._updateCountInterval = null; }
                this.loadSettings();
                this.loadSkipped();
                this.loadTestEmployers();
                // FIX: tryRestoreBot перенесён после загрузки настроек — восстановленный бот видит актуальные данные
                tryRestoreBot();
                this.createInterface();
                this.setupEventListeners();
                const W = window.__HH_WASM__;
                this.updateStatus('v' + VERSION + ' Готов' + (W ? ' [WASM]' : ' [JS]'));
            }

            suspend() {
                this.stopAutoProcess();
                if (this._updateCountInterval) { clearInterval(this._updateCountInterval); this._updateCountInterval = null; }
            }

            destroy() {
                this._reallyDestroyed = true;
                this.stopAutoProcess();
                // [FIX interval leak] _updateCountInterval не очищался в destroy() —
                // интервал продолжал тикать и вызывать getAvailableButtons() на уничтоженном экземпляре
                if (this._updateCountInterval) { clearInterval(this._updateCountInterval); this._updateCountInterval = null; }
                while (this.iframeCheckQueue.length) { const cb = this.iframeCheckQueue.shift(); if (typeof cb === 'function') cb(); }
                this.iframeCheckInProgress = false;
            }

            loadTestEmployers() {
                try {
                    const saved = localStorage.getItem('hh-test-employers');
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        if (Array.isArray(parsed)) this.testEmployerIds = new Set(parsed.map(String));
                    }
                } catch(e) {
                    localStorage.removeItem('hh-test-employers');
                    this.testEmployerIds = new Set();
                }
            }

            loadSkipped() {
                try {
                    const saved = localStorage.getItem('hh-skipped-vacancies');
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        if (Array.isArray(parsed)) {
                            this.skippedVacancies = new Set(parsed.filter(v => typeof v === 'string' && v.startsWith('id_')));
                        } else throw new Error('invalid format');
                    }
                } catch(e) {
                    localStorage.removeItem('hh-skipped-vacancies');
                    this.skippedVacancies = new Set();
                }
            }

            addSkippedVacancy(key) {
                if (!key) return;
                this.skippedVacancies.add(String(key));
                if (this.skippedVacancies.size > 500) {
                    const oldest = this.skippedVacancies.values().next().value;
                    this.skippedVacancies.delete(oldest);
                }
                try { localStorage.setItem('hh-skipped-vacancies', JSON.stringify([...this.skippedVacancies])); } catch(e) {}
            }

            loadSettings() {
                try {
                    const s = localStorage.getItem('hh-auto-settings');
                    if (s) {
                        const p = JSON.parse(s);
                        if (p.coverLetter && typeof p.coverLetter === 'string') this.coverLetter = p.coverLetter;
                        if (p.settings && typeof p.settings === 'object') {
                            const merged = { ...this.settings, ...p.settings };
                            merged.delay = Math.min(5, Math.max(0.3, parseFloat(merged.delay) || 0.5));
                            merged.resumeTitleMatching = Math.min(100, Math.max(0, parseInt(merged.resumeTitleMatching) || 70));
                            merged.autoNextPage = !!merged.autoNextPage;
                            merged.skipResponded = !!merged.skipResponded;
                            merged.filterOrganizations = !!merged.filterOrganizations;
                            merged.autoRememberOrganizations = !!merged.autoRememberOrganizations;
                            merged.skipCoverLetter = !!merged.skipCoverLetter;
                            merged.autoSelectResume = !!merged.autoSelectResume;
                            this.settings = merged;
                        }
                        if (p.stats && typeof p.stats === 'object') {
                            // FIX: поля stats из localStorage — строки; "150"++ = NaN / "1501"; Number() приводит к числу
                            this.stats = {
                                success: Number(p.stats.success) || 0,
                                failed:  Number(p.stats.failed)  || 0,
                                skipped: Number(p.stats.skipped) || 0
                            };
                        }
                        if (p.theme === 'dark' || p.theme === 'light') this.theme = p.theme;
                        if (Array.isArray(p.filteredOrganizations)) this.filteredOrganizations = p.filteredOrganizations;
                        if (Array.isArray(p.autoFilteredOrganizations)) this.autoFilteredOrganizations = p.autoFilteredOrganizations;
                    }
                } catch(e) { localStorage.removeItem('hh-auto-settings'); }
            }

            debouncedSave() {
                clearTimeout(this._saveTimer);
                this._saveTimer = setTimeout(() => this.saveSettings(), 400);
            }

            saveSettings() {
                try {
                    localStorage.setItem('hh-auto-settings', JSON.stringify({
                        coverLetter: this.coverLetter,
                        settings: this.settings,
                        stats: this.stats,
                        theme: this.theme,
                        filteredOrganizations: this.filteredOrganizations,
                        autoFilteredOrganizations: this.autoFilteredOrganizations
                    }));
                } catch(e) {}
            }

            wait(ms) { return new Promise(r => setTimeout(r, ms)); }

            async smartDelay() {
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
                } catch(e) {}
            }

            isLimitReached() {
                const lm = document.querySelector('[data-qa-popup-error-code="negotiations-limit-exceeded"]');
                if (lm?.offsetParent) return true;
                const ue = document.querySelector('[data-qa-popup-error-code="unknown"]');
                if (ue?.offsetParent) {
                    const t = ue.textContent || '';
                    if ((t.includes('не более 200') || t.includes('лимит') || t.includes('исчерпали')) && this.stats.success >= 190) return true;
                }
                const ms = document.querySelectorAll('.magritte-text, .bloko-translate-guard');
                for (const m of ms) {
                    if (m.textContent && (m.textContent.includes('не более 200 откликов') || m.textContent.includes('Вы исчерпали лимит')) && m.offsetParent) return true;
                }
                return false;
            }

            _getCard(b) {
                // [data-qa~=] — word-match: работает при data-qa="vacancy-serp__vacancy vacancy-serp-item_clickme"
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
                // [FIX утечка памяти] autoFilteredOrganizations рос неограниченно — cap на 1000
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

            async waitForIframeSlot() {
                if (!this.iframeCheckInProgress) return;
                return new Promise(resolve => {
                    const slotResolver = () => { clearTimeout(timeout); resolve(); };
                    this.iframeCheckQueue.push(slotResolver);
                    const timeout = setTimeout(() => {
                        const idx = this.iframeCheckQueue.indexOf(slotResolver);
                        if (idx >= 0) { this.iframeCheckQueue.splice(idx, 1); resolve(); }
                    }, 15000);
                });
            }

            notifyIframeSlotFree() {
                this.iframeCheckInProgress = false;
                const next = this.iframeCheckQueue.shift();
                if (next) next();
            }

            async checkTestViaIframe(vacancyId, employerId, organizationName) {
                const _prevLock = this._iframeMutex;
                let _releaseLock;
                this._iframeMutex = new Promise(r => { _releaseLock = r; });
                await _prevLock;
                this.iframeCheckInProgress = true;
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
                        // [FIX дублирующий mutex] notifyIframeSlotFree убран — управление
                        // параллельностью полностью через _iframeMutex. waitForIframeSlot/
                        // iframeCheckInProgress были вторым механизмом для того же ресурса.
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
                                    try { localStorage.setItem('hh-test-employers', JSON.stringify([...this.testEmployerIds])); } catch(e) {}
                                }
                                if (organizationName && this.settings.autoRememberOrganizations) this.addToAutoFilter(organizationName);
                                this.stats.skipped++;
                                this.updateStatsDisplay();
                                finish({ isTest: true });
                                return;
                            }

                            // 2. Прямой отклик — жмём кнопку в iframe, она закроется
                            const directLink = d.querySelector('[data-qa="vacancy-response-link-advertising"]');
                            if (directLink && directLink.offsetParent) {
                                try { directLink.click(); } catch(e) {}
                                // FIX: callback захватывает resolved через замыкание — проверяем что ещё не завершено
                                setTimeout(() => {
                                    if (!resolved) {
                                        this.stats.success++;
                                        this.updateStatsDisplay();
                                        finish({ isTest: false, directResponse: true });
                                    }
                                }, 500);
                                return;
                            }

                            // 3. Обычная форма отклика
                            const submitBtn = d.querySelector('[data-qa="vacancy-response-submit-popup"]');
                            if (submitBtn && submitBtn.offsetParent && !submitBtn.hasAttribute('disabled')) {
                                finish({ isTest: false });
                                return;
                            }

                            // 4. Ждём ещё
                            if (attempts > 20) {
                                finish({ isTest: false, empty: true });
                                return;
                            }
                        } catch(e) {
                            if (e.name === 'SecurityError' || e.code === 18) {
                                finish({ isTest: false, denied: true });
                            }
                        }
                    };

                    iframe.addEventListener('load', () => {
                        // [FIX двойной finish] Если interval уже завершил проверку — выходим
                        if (resolved) return;
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
                        // [FIX interval leak] Оборачиваем appendChild — если бросит исключение,
                        // interval будет висеть бесконечно. finish() очищает его через cleanup().
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
                try { const b = document.querySelector('[data-qa="chatik-close-chatik"]'); if (b?.offsetParent) { b.click(); await this.wait(500); return true; } } catch(e) {}
                return false;
            }

            async checkAndCloseDirectResponseModal(o) {
                const dialog = document.querySelector('[role="alertdialog"][aria-modal="true"]');
                if (!dialog?.offsetParent) return false;
                const title = dialog.querySelector('[data-qa="magritte-alert-title"]') || dialog.querySelector('[data-qa="title"]');
                if (!title?.textContent.includes('прямым откликом')) return false;
                if (o && this.settings.autoRememberOrganizations) this.addToAutoFilter(o);
                const cancelBtn = dialog.querySelector('[data-qa="vacancy-response-link-advertising-cancel"]')
                               || dialog.querySelector('[data-qa="vacancy-response-popup-close"]')
                               || dialog.querySelector('button[aria-label="Закрыть"]');
                if (cancelBtn) { cancelBtn.click(); }
                else { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); }
                await this.wait(500);
                return true;
            }

            getVacancyTitleFromModal() {
                for (const s of ['[data-qa="title-description"] .magritte-text_style-secondary', '[data-qa="title-description"] .magritte-text', '.magritte-modal-content [data-qa="title-description"]', '[role="dialog"] [data-qa="title-description"]']) {
                    const e = document.querySelector(s);
                    if (e) { const t = e.textContent.trim(); if (t && t.length > 2 && t.length < 200 && !t.includes('Отклик')) return t; }
                }
                return null;
            }

            async closeModal() {
                const b = document.querySelector('[data-qa="vacancy-response-popup-close"]') || document.querySelector('[aria-label="Закрыть"]');
                if (b) { b.click(); await this.wait(300); }
            }

            async openResumeDropdown() {
                const rc = document.querySelector('[data-qa="resume-title"]');
                if (rc) {
                    const cl = rc.closest('[role="button"],[tabindex="0"]');
                    if (cl) { cl.click(); await this.wait(600); const dd = document.querySelector('[role="listbox"]'); if (dd?.offsetParent) return true; }
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
                // FIX: try/finally гарантирует закрытие дропдауна даже при исключении
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
                    // FIX: перезапрашиваем кнопку после ожидания — старая ссылка могла остаться disabled
                    sb = document.querySelector('[data-qa="vacancy-response-submit-popup"]:not([disabled])') || document.querySelector('[data-qa="vacancy-response-submit-popup"]');
                    if (!sb || sb.hasAttribute('disabled')) return false;
                }
                sb.click();
                await this.wait(2000);
                return !this.isLimitReached();
            }

            async _processResponseInternal(o, depth, vacancyTitle) {
                // FIX: depth не накапливался при рекурсии — stack overflow при петле UI
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
                const al = document.querySelector('[data-qa="add-cover-letter"]');
                if (al && !this.settings.skipCoverLetter) { al.click(); await this.wait(800); return await this._processResponseInternal(o, depth + 1, vacancyTitle); }
                const rl = document.querySelector('[data-qa="relocation-warning-confirm"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Все равно откликнуться'));
                if (rl) { rl.click(); await this.wait(800); return await this._processResponseInternal(o, depth + 1, vacancyTitle); }
                return await this.submitResponse();
            }

            async processResponse(o, depth = 0, vacancyTitle = null) {
                // FIX: убран мёртвый guard depth>10 — _processResponseInternal обрывает на depth>5
                const TIMEOUT_MS = 15000;
                let timeoutId;
                const timeoutPromise = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS); });
                try {
                    const result = await Promise.race([this._processResponseInternal(o, depth, vacancyTitle), timeoutPromise]);
                    clearTimeout(timeoutId);
                    return result;
                } catch(e) {
                    clearTimeout(timeoutId);
                    await this.closeModal();
                    return false;
                }
            }

            async safeClick(b) {
                try {
                    await this.humanScroll(b);
                    await this.wait(200 + Math.random() * 300);
                    b.click();
                    await this.wait(600 + Math.random() * 400);
                    return true;
                } catch(e) { return false; }
            }

            findButtonByVacancyId(vacancyId) {
                if (!vacancyId) return null;
                for (const btn of document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]')) {
                    if (!btn.offsetParent || btn.style.display === 'none') continue;
                    if (this.getVacancyId(btn) === vacancyId) return btn;
                }
                return null;
            }

            getAvailableButtons() {
				// [FIX side effect] tryRestoreBot убран из getter — вызывался каждые 5с через updateCount()
				// и мог пересоздать состояние бота. Вызывается только в startAutoProcess/testProcess/кнопках.
				if (window.location.href.includes('/applicant/vacancy_response')) return [];
				return Array.from(document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]')).filter(b => {
					if (!b.offsetParent || b.style.display === 'none') return false;
					// FIX: b.href на <button> undefined — фильтр применяем только к <a>-элементам
					if (b.tagName === 'A' && (b.target === '_blank' || (b.href && !b.href.includes('/applicant/vacancy_response')))) return false;
					if (this.isFilteredOrganization(b)) return false;
					const vid = this.getVacancyId(b);
					if (vid && this.skippedVacancies.has('id_' + vid)) return false;
					const empId = this.getEmployerIdFromCard(b);
					if (empId && this.testEmployerIds.has(String(empId))) return false;
					if (this.settings.skipResponded) {
						const p = b.closest('.vacancy-serp-item') || b.closest('[class*="vacancy-card"]');
						// FIX: innerText триггерит layout reflow; textContent быстрее и достаточен для проверки
						if (p && ((p.textContent || '').includes('Вы откликнулись') || p.querySelector('[data-qa="vacancy-serp__vacancy_responded"]'))) return false;
					}
					return true;
				});
			}

            async processSingleVacancy(b, i, t) {
					tryRestoreBot();
					const bot = window.hhAutoResponder || this;
					if (!bot.isRunning) return false;
					if (bot.isLimitReached()) { bot.updateStatus('Лимит откликов. Остановка.'); bot.stopAutoProcess(); return false; }

					const o = bot.getOrganizationNameFromCard(b);
					const vacancyId = bot.getVacancyId(b);
					const employerId = bot.getEmployerIdFromCard(b);
					const vacancyTitle = bot.getVacancyTitleFromCard(b);

					// FIX: bt-массив строится один раз — за время итерации фильтры обновляются.
					// Возвращаем null (не false) чтобы цикл не делал smartDelay для пропущенных.
					if (!b.offsetParent || b.style.display === 'none') return null;
					if (b.tagName === 'A' && (b.target === '_blank' || (b.href && !b.href.includes('/applicant/vacancy_response')))) return null;
					if (bot.isFilteredOrganization(b)) { bot.stats.skipped++; bot.updateStatsDisplay(); return null; }
					if (vacancyId && bot.skippedVacancies.has('id_' + vacancyId)) return null;
					if (employerId && bot.testEmployerIds.has(String(employerId))) { bot.stats.skipped++; bot.updateStatsDisplay(); return null; }
					if (bot.settings.skipResponded) {
						const _p = b.closest('.vacancy-serp-item') || b.closest('[class*="vacancy-card"]');
						if (_p && ((_p.textContent || '').includes('Вы откликнулись') || _p.querySelector('[data-qa="vacancy-serp__vacancy_responded"]'))) return null;
					}

					if (vacancyId) {
						const checkResult = await bot.checkTestViaIframe(vacancyId, employerId, o);
						if (checkResult.isTest) return false;
						if (checkResult.directResponse) return false;
					}

					await bot.wait(500 + Math.random() * 500);
					const _progressPct = t > 0 ? Math.round(((i + 1) / t) * 100) : 0;
					bot.updateStatus((i + 1) + '/' + t + ' (' + _progressPct + '%) — ' + (o || 'Обработка...'));

					let targetBtn = b;
					if (!b.offsetParent) {
						if (vacancyId) targetBtn = bot.findButtonByVacancyId(vacancyId);
						if (!targetBtn) { bot.stats.skipped++; bot.updateStatsDisplay(); return false; }
					}

					if (!(await bot.safeClick(targetBtn))) { bot.stats.failed++; bot.consecutiveErrors++; bot.updateStatsDisplay(); return false; }

					await bot.wait(600 + Math.random() * 400);
					if (await bot.checkAndCloseDirectResponseModal(o)) {
						bot.stats.skipped++;
						if (vacancyId) bot.addSkippedVacancy('id_' + vacancyId);
						bot.updateStatsDisplay();
						return false;
					}

					await bot.wait(700 + Math.random() * 500);
					bot.resumeSelectedFlag = false;
					const ok = await bot.processResponse(o, 0, vacancyTitle);

					if (ok === 'DIRECT_RESPONSE') {
						bot.stats.skipped++;
						if (vacancyId) bot.addSkippedVacancy('id_' + vacancyId);
						bot.updateStatsDisplay();
						await bot.closeModal();
						return false;
					}

					if (ok) {
						bot.consecutiveErrors = 0;
						bot.stats.success++;
						if (o && bot.settings.autoRememberOrganizations) {
							bot.addToAutoFilter(o);
						}
					} else {
						bot.consecutiveErrors++;
						bot.stats.failed++;
					}
					bot.updateStatsDisplay();
					await bot.closeModal();
					if (window.location.href.includes('/applicant/vacancy_response')) window.history.back();
					return ok;
				}

            async startAutoProcess() {
                tryRestoreBot();
                const bot = window.hhAutoResponder || this;
                if (bot.isRunning) return;
                if (window.location.href.includes('/applicant/vacancy_response')) { bot.updateStatus('Перейдите на страницу поиска'); return; }
                bot.isRunning = true;
                bot.updateControlButtons();
                bot.updateStatus('Запуск...');
                try {
                    while (bot.isRunning) {
                        await bot.smartDelay();
                        const bt = bot.getAvailableButtons();
                        if (!bt.length) {
                            // НАДЁЖНОСТЬ: диагностика — сколько кнопок есть в DOM vs сколько прошло фильтр
                            const allBtns = document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]');
                            const visibleBtns = Array.from(allBtns).filter(b => b.offsetParent && b.style.display !== 'none');
                            if (allBtns.length > 0 && visibleBtns.length > 0) {
                                // Кнопки есть в DOM но все отфильтрованы — сообщаем детально
                                bot.updateStatus('Все ' + visibleBtns.length + ' вакансий на странице отфильтрованы/пропущены');
                            } else {
                                bot.updateStatus('Все обработаны');
                            }
                            if (bot.settings.autoNextPage) {
                                const n = document.querySelector('[data-qa="pager-next"]');
                                if (n) {
                                    const pageMatch = window.location.href.match(/[?&]page=(\d+)/);
                                    const currentPage = pageMatch ? parseInt(pageMatch[1]) + 1 : 2;
                                    bot.updateStatus('Переход на стр. ' + currentPage + '...');
                                    n.click();
                                    await bot.wait(2500 + Math.random() * 1500);
                                    continue;
                                }
                            }
                            bot.updateStatus('Завершено! ✅' + bot.stats.success + ' ❌' + bot.stats.failed + ' ⏭️' + bot.stats.skipped);
                            bot.saveSettings();
                            break;
                        }
                        for (let i = 0; i < bt.length && bot.isRunning; i++) {
                            const _result = await bot.processSingleVacancy(bt[i], i, bt.length);
                            if (bot.consecutiveErrors >= 3) {
                            bot.updateStatus(bot.consecutiveErrors + ' ошибок подряд — пауза 30с...');
                            await bot.wait(30000);
                            bot.consecutiveErrors = 0;
                        }
                        // НАДЁЖНОСТЬ: если 8+ ошибок подряд — возможно страница зависла, перезагружаем
                        if (bot.consecutiveErrors >= 8) {
                            bot.updateStatus('Слишком много ошибок — перезагрузка страницы...');
                            await bot.wait(2000);
                            window.location.reload();
                            return;
                        }
                            // FIX: smartDelay только при реальной попытке отклика (не для пропущенных фильтром)
                            if (_result !== null && i < bt.length - 1 && bot.isRunning) await bot.smartDelay();
                        }
                        await bot.wait(500 + Math.random() * 500);
                    }
                } catch(e) {
                    console.error(e);
                } finally {
                    // FIX: finally гарантирует вызов stopAutoProcess даже если catch бросит исключение
                    bot.stopAutoProcess();
                }
            }

            stopAutoProcess() {
                // FIX: убран tryRestoreBot — stop не должен иметь side-effect восстановления
                const bot = window.hhAutoResponder || this;
                const wasRunning = bot.isRunning;
                bot.isRunning = false;
                bot.updateControlButtons();
                while (bot.iframeCheckQueue.length) { const cb = bot.iframeCheckQueue.shift(); if (typeof cb === 'function') cb(); }
                bot.iframeCheckInProgress = false;
                // UX: показываем итог при ручной остановке
                if (wasRunning) {
                    bot.updateStatus('Остановлено ✅' + bot.stats.success + ' ❌' + bot.stats.failed + ' ⏭️' + bot.stats.skipped);
                    bot.saveSettings();
                }
            }

            async testProcess() {
                tryRestoreBot();
                const bot = window.hhAutoResponder || this;
                // FIX: без guard двойной клик запускал два параллельных теста с общим состоянием
                if (bot.isRunning) return;
                const bt = bot.getAvailableButtons();
                if (!bt.length) return;
                bot.isRunning = true;
                bot.updateControlButtons();
                try {
                    await bot.processSingleVacancy(bt[0], 0, 1);
                } finally {
                    // FIX: finally гарантирует сброс isRunning даже при исключении в processSingleVacancy
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
                addListener($('hh-skip-cover-letter'), 'change', e => {
                    this.settings.skipCoverLetter = e.target.checked; this.saveSettings();
                    const ta = $('hh-letter'); if (ta) { ta.style.opacity = e.target.checked ? '0.5' : '1'; ta.style.pointerEvents = e.target.checked ? 'none' : 'auto'; }
                    this.updateStatus(e.target.checked ? 'Письмо ОТКЛЮЧЕНО' : 'Письмо ВКЛЮЧЕНО');
                });
                addListener($('hh-auto-select-resume'), 'change', e => { this.settings.autoSelectResume = e.target.checked; this.debouncedSave(); this.updateStatus(e.target.checked ? 'Автовыбор ВКЛЮЧЕН' : 'Автовыбор ВЫКЛЮЧЕН'); });
                addListener($('hh-resume-matching'), 'input', e => { this.settings.resumeTitleMatching = parseInt(e.target.value); const mv = $('hh-matching-value'); if (mv) mv.textContent = this.settings.resumeTitleMatching + '%'; this.debouncedSave(); });
                addListener($('hh-auto-remember'), 'change', e => { this.settings.autoRememberOrganizations = e.target.checked; this.debouncedSave(); this.updateStatus(e.target.checked ? 'АВТОфильтр ВКЛЮЧЕН' : 'АВТОфильтр выключен'); });
                addListener($('hh-letter'), 'input', e => {
                    this.coverLetter = e.target.value;
                    const cc = $('hh-char-count'); if (cc) cc.textContent = e.target.value.length + '/2000';
                    // [FIX debounce] saveSettings при каждом нажатии клавиши — десятки записей в секунду.
                    // Сохраняем не чаще раза в 500мс.
                    clearTimeout(this._saveTimer);
                    this._saveTimer = setTimeout(() => this.saveSettings(), 500);
                });
                addListener($('hh-auto-next'), 'change', e => { this.settings.autoNextPage = e.target.checked; this.debouncedSave(); });
                addListener($('hh-skip-responded'), 'change', e => { this.settings.skipResponded = e.target.checked; this.debouncedSave(); });
                addListener($('hh-filter-organizations'), 'change', e => { this.settings.filterOrganizations = e.target.checked; this.debouncedSave(); });
                addListener($('hh-delay'), 'change', e => { this.settings.delay = parseFloat(e.target.value) || 0.5; this.debouncedSave(); });
                addListener($('hh-filter-text'), 'input', e => { this.filteredOrganizations = e.target.value.split(',').map(o => o.trim()).filter(o => o); this.debouncedSave(); });

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
                // Сохраняем статистику при каждом обновлении — не теряется при перезагрузке
                this.debouncedSave();
            }

            updateCount() {
                const el = document.getElementById('hh-count');
                if (!el) return;
                // Не пересчитываем во время работы бота — дорогая операция с DOM
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
                    if (!b.offsetParent || b.style.display === 'none') {
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
                            } else if (this.settings.skipResponded) {
                                const p = b.closest('.vacancy-serp-item') || b.closest('[class*="vacancy-card"]');
                                if (p && ((p.textContent || '').includes('Вы откликнулись') || p.querySelector('[data-qa="vacancy-serp__vacancy_responded"]'))) {
                                    reason = 'уже откликнулись';
                                }
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
                const visible = Array.from(all).filter(b => b.offsetParent && b.style.display !== 'none');
                this.updateStatus('АНАЛИЗ:\nВсего кнопок: ' + all.length + '\nВидимых: ' + visible.length + '\nДоступно: ' + this.getAvailableButtons().length + '\n\u2705' + this.stats.success + ' \u274C' + this.stats.failed + ' \u23ED\uFE0F' + this.stats.skipped);
            }

            clearHistory() {
                this.stopAutoProcess();
                this.skippedVacancies.clear();
                this.testEmployerIds.clear();
                try { localStorage.removeItem('hh-skipped-vacancies'); localStorage.removeItem('hh-test-employers'); } catch(e) {}
                this.stats = { success: 0, failed: 0, skipped: 0 };
                this.consecutiveErrors = 0;
                this.updateStatsDisplay();
                this.updateStatus('Всё очищено. Бот остановлен.');
            }
        }

        // FIX: guard против дублирующихся listener при повторной инициализации
        if (!window.__HH_MSG_LISTENER__) {
            try {
                chrome.runtime.onMessage.addListener((r, s, res) => {
                    if (r.action === 'checkConnection') { res({ connected: !!window.hhAutoResponder || !!window.__hh_bot_instance__ }); }
                    return true;
                });
                window.__HH_MSG_LISTENER__ = true;
            } catch(e) {}
        }

        let botInstance = null;

        function initBot() {
            if (botInstance && !botInstance._reallyDestroyed) { botInstance.suspend(); botInstance.init(); return; }
            if (botInstance && typeof botInstance.destroy === 'function') botInstance.destroy();
            botInstance = new HHAutoResponder();
        }

        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => setTimeout(initBot, 800)); }
        else { setTimeout(initBot, 800); }

        window.addEventListener('beforeunload', () => { if (botInstance && typeof botInstance.suspend === 'function') botInstance.suspend(); });
        window.addEventListener('popstate', () => { setTimeout(() => {
            // FIX: не реинициализировать если бот работает — сломает UI в процессе обработки
            if (botInstance && !botInstance._reallyDestroyed && !botInstance.isRunning) botInstance.init();
        }, 1000); });
    }).catch(e => console.error('HH AutoResponder init failed:', e));
})();