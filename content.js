// ===== HH AUTO RESPONDER v2.0 — IFRAME TEST DETECTOR =====
(function() {
    'use strict';

    if (!window.location.href.includes('hh.ru')) return;

    // 🔴 БЛОК 1: ТРОЙНОЙ ДЕТЕКТОР ТЕСТА (на случай прямого перехода)
    (function() {
        function isTestPage() {
            if (window.location.href.includes('startedWithQuestion=false')) return true;
            if (document.querySelector('input[name="testRequired"]')?.value === 'true') return true;
            if (document.querySelector('[data-qa="test-description"]')) return true;
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
                        localStorage.setItem('hh-test-employers', JSON.stringify(testEmps));
                    }
                } catch(e) {}
            }
            
            if (vid) {
                try {
                    const skipped = JSON.parse(localStorage.getItem('hh-skipped-vacancies') || '[]');
                    if (!skipped.includes('id_' + vid)) {
                        skipped.push('id_' + vid);
                        localStorage.setItem('hh-skipped-vacancies', JSON.stringify(skipped));
                    }
                } catch(e) {}
            }
            
            console.log('🧪 Тест обнаружен! Возврат...');
            window.history.back();
        }
        
        if (isTestPage()) { escapeFromTest(); return; }
        
        setTimeout(() => { if (isTestPage()) escapeFromTest(); }, 500);
        
        const observer = new MutationObserver(() => {
            if (isTestPage()) { observer.disconnect(); escapeFromTest(); }
        });
        
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, { childList: true, subtree: true });
            });
        }
        
        setTimeout(() => observer.disconnect(), 10000);
    })();

    function waitForCore() {
        return new Promise(resolve => {
            if (window.__HH_CORE_READY__) { resolve(); return; }
            window.addEventListener('hh-core-ready', resolve, { once: true });
        });
    }

    waitForCore().then(() => {
        console.log('=== HH Авто-отклик v2.1 [IFrame] ===');

        class HHAutoResponder {
            constructor() {
                this.coverLetter = "Добрый день! Заинтересовала ваша вакансия. Мой опыт соответствует требованиям. Готов(а) к собеседованию. С уважением, [Ваше Имя]";
                this.isRunning = false;
                this.processedVacancies = new Set();
                this.skippedVacancies = new Set();
                this.testEmployerIds = new Set();
                this.stats = { success: 0, failed: 0, skipped: 0, total: 0 };
                this.settings = { autoNextPage: true, skipResponded: true, delay: 0.5, filterOrganizations: true, autoRememberOrganizations: true, skipCoverLetter: false, autoSelectResume: true, resumeTitleMatching: 70 };
                this.filteredOrganizations = [];
                this.autoFilteredOrganizations = [];
                this.theme = 'dark';
                this.resumeSelectedFlag = false;
                this.settingsCollapsed = true;
                this.consecutiveErrors = 0;
                this.currentVacancyId = null;

                window.hhAutoResponder = this;
                this.init();
            }

            init() {
                this.loadSettings();
                this.loadSkipped();
                this.loadTestEmployers();
                this.createInterface();
                this.setupEventListeners();
                if (this.settings.resumeTitleMatching > 80) { this.settings.resumeTitleMatching = 70; this.saveSettings(); }
                const W = window.__HH_WASM__;
                this.updateStatus('✅ Готов [IFrame]' + (W ? ' [WASM]' : ' [JS]'));
            }

            loadTestEmployers() {
                try {
                    const saved = localStorage.getItem('hh-test-employers');
                    if (saved) this.testEmployerIds = new Set(JSON.parse(saved));
                } catch(e) { this.testEmployerIds = new Set(); }
            }

            loadSkipped() {
                try {
                    const saved = localStorage.getItem('hh-skipped-vacancies');
                    if (saved) this.skippedVacancies = new Set(JSON.parse(saved));
                } catch(e) {}
            }

            addSkippedVacancy(key) {
                if (!key) return;
                this.skippedVacancies.add(String(key));
                try { localStorage.setItem('hh-skipped-vacancies', JSON.stringify([...this.skippedVacancies])); } catch(e) {}
            }

            // Проверка кнопки на тест (по employerId и skipped)
            isTestVacancy(b) {
                const href = b.href || b.getAttribute('href') || '';
                const empMatch = href.match(/employerId=(\d+)/);
                if (empMatch && this.testEmployerIds.has(empMatch[1])) return true;
                const vid = this.getVacancyId(b);
                if (vid && this.skippedVacancies.has('id_' + vid)) return true;
                return false;
            }

            getVacancyId(b) {
                if (b.href) {
                    let match = b.href.match(/vacancyId=(\d+)/);
                    if (match) return match[1];
                }
                const card = b.closest('[data-qa="vacancy-serp__vacancy"]') || b.closest('[class*="vacancy-card"]') || b.closest('[class*="branded-snippet"]');
                if (card) {
                    const link = card.querySelector('a[href*="vacancyId="], a[href*="/vacancy/"]');
                    if (link) {
                        let match = link.href.match(/vacancyId=(\d+)/) || link.href.match(/\/vacancy\/(\d+)/);
                        if (match) return match[1];
                    }
                }
                return null;
            }

            // 🔴 ПРОВЕРКА ТЕСТА ЧЕРЕЗ СКРЫТЫЙ IFRAME
            async checkTestViaIframe(vacancyId, employerId, organizationName) {
                return new Promise((resolve) => {
                    const iframe = document.createElement('iframe');
                    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
                    iframe.src = `https://hh.ru/applicant/vacancy_response?vacancyId=${vacancyId}&employerId=${employerId}&hhtmFrom=vacancy_search_list`;
                    
                    let resolved = false;
                    
                    iframe.onload = () => {
                        if (resolved) return;
                        
                        try {
                            const doc = iframe.contentDocument || iframe.contentWindow.document;
                            
                            let attempts = 0;
                            const checkInterval = setInterval(() => {
                                attempts++;
                                
                                // 🔴 ТРИ ПРИЗНАКА ТЕСТА
                                const urlHasTest = doc.location?.href?.includes('startedWithQuestion=false');
                                const hasTestField = doc.querySelector('input[name="testRequired"]')?.value === 'true';
                                const hasTestDescription = !!doc.querySelector('[data-qa="test-description"]');
                                
                                if (urlHasTest || hasTestField || hasTestDescription) {
                                    clearInterval(checkInterval);
                                    console.log('🧪 ТЕСТ:', organizationName);
                                    
                                    // Сохраняем ID и employerId
                                    this.addSkippedVacancy('id_' + vacancyId);
                                    if (employerId) {
                                        this.testEmployerIds.add(String(employerId));
                                        try { localStorage.setItem('hh-test-employers', JSON.stringify([...this.testEmployerIds])); } catch(e) {}
                                    }
                                    if (organizationName && this.settings.autoRememberOrganizations) {
                                        this.addToAutoFilter(organizationName);
                                    }
                                    this.stats.skipped++;
                                    this.updateStatsDisplay();
                                    
                                    iframe.remove();
                                    resolved = true;
                                    resolve({ isTest: true });
                                    return;
                                }
                                
                                // 🔴 Если появилась кнопка отправки — это НЕ тест
                                const submitBtn = doc.querySelector('[data-qa="vacancy-response-submit-popup"]');
                                if (submitBtn && submitBtn.offsetParent && !submitBtn.hasAttribute('disabled')) {
                                    clearInterval(checkInterval);
                                    iframe.remove();
                                    resolved = true;
                                    resolve({ isTest: false });
                                    return;
                                }
                                
                                if (attempts > 40) {
                                    clearInterval(checkInterval);
                                    iframe.remove();
                                    resolved = true;
                                    resolve({ isTest: false, timeout: true });
                                }
                            }, 500);
                            
                        } catch(e) {
                            iframe.remove();
                            resolved = true;
                            resolve({ isTest: false, error: e.message });
                        }
                    };
                    
                    iframe.onerror = () => {
                        if (!resolved) {
                            iframe.remove();
                            resolved = true;
                            resolve({ isTest: false, error: 'iframe_error' });
                        }
                    };
                    
                    document.body.appendChild(iframe);
                    
                    setTimeout(() => {
                        if (!resolved) {
                            iframe.remove();
                            resolved = true;
                            resolve({ isTest: false, timeout: true });
                        }
                    }, 20000);
                });
            }

            loadSettings() {
                try {
                    const s = localStorage.getItem('hh-auto-settings');
                    if (s) {
                        const p = JSON.parse(s);
                        if (p.coverLetter) this.coverLetter = p.coverLetter;
                        if (p.settings) this.settings = { ...this.settings, ...p.settings };
                        if (p.stats) this.stats = { ...this.stats, ...p.stats };
                        if (p.theme) this.theme = p.theme;
                        if (p.filteredOrganizations) this.filteredOrganizations = p.filteredOrganizations;
                        if (p.autoFilteredOrganizations) this.autoFilteredOrganizations = p.autoFilteredOrganizations;
                    }
                } catch(e) {}
            }

            saveSettings() {
                try { localStorage.setItem('hh-auto-settings', JSON.stringify({ coverLetter: this.coverLetter, settings: this.settings, stats: this.stats, theme: this.theme, filteredOrganizations: this.filteredOrganizations, autoFilteredOrganizations: this.autoFilteredOrganizations })); } catch(e) {}
            }

            wait(ms) { return new Promise(r => setTimeout(r, ms)); }

            isLimitReached() {
                const lm = document.querySelector('[data-qa-popup-error-code="negotiations-limit-exceeded"]');
                if (lm?.offsetParent) return 'limit_exceeded';
                const ue = document.querySelector('[data-qa-popup-error-code="unknown"]');
                if (ue?.offsetParent) { const t = ue.textContent||''; if (t.includes('Произошла ошибка') && this.consecutiveErrors >= 2 && this.stats.success >= 190) return 'unknown_error_probably_limit'; }
                const ms = document.querySelectorAll('.magritte-text, .bloko-translate-guard');
                for (const m of ms) { if (m.textContent && (m.textContent.includes('не более 200 откликов')||m.textContent.includes('Вы исчерпали лимит')) && m.offsetParent) return 'limit_exceeded_text'; }
                if (this.consecutiveErrors >= 3) return 'consecutive_errors';
                return false;
            }

            createInterface() {
                document.getElementById('hh-auto-panel')?.remove();
                document.getElementById('hh-toggle-btn')?.remove();
                this.panel = window.__HH_UI__.createPanel(this);
                document.body.appendChild(this.panel);
                this.toggleButton = window.__HH_UI__.createToggleButton(this);
                document.body.appendChild(this.toggleButton);
                this.updateCount();
                this.updateStatsDisplay();
            }

            setupEventListeners() {
                const $ = id => document.getElementById(id);
                this.toggleButton.addEventListener('click', () => { this.panel.style.display = this.panel.style.display === 'none' ? 'block' : 'none'; });
                $('hh-close-btn').addEventListener('click', () => { this.panel.style.display = 'none'; });
                $('hh-settings-header')?.addEventListener('click', () => this.toggleSettings());
                $('hh-theme-slider')?.addEventListener('click', () => { this.toggleTheme(); this.createInterface(); this.setupEventListeners(); });
                $('hh-start').addEventListener('click', () => this.startAutoProcess());
                $('hh-test').addEventListener('click', () => this.testProcess());
                $('hh-stop').addEventListener('click', () => this.stopAutoProcess());
                $('hh-analyze').addEventListener('click', () => this.analyzePage());
                $('hh-test-filter').addEventListener('click', () => this.testFilter());
                $('hh-show-auto-filter').addEventListener('click', () => this.showAutoFilter());
                $('hh-clear').addEventListener('click', () => this.clearHistory());
                $('hh-clear-auto-filter').addEventListener('click', () => this.clearAutoFilter());
                $('hh-skip-cover-letter').addEventListener('change', e => { this.settings.skipCoverLetter = e.target.checked; this.saveSettings(); const ta = $('hh-letter'); if (ta) { ta.style.opacity = e.target.checked ? '0.5' : '1'; ta.style.pointerEvents = e.target.checked ? 'none' : 'auto'; } this.updateStatus(e.target.checked ? '📝 Письмо ОТКЛЮЧЕНО' : '📝 Письмо ВКЛЮЧЕНО'); });
                $('hh-auto-select-resume').addEventListener('change', e => { this.settings.autoSelectResume = e.target.checked; this.saveSettings(); this.updateStatus(e.target.checked ? '🎯 Автовыбор ВКЛЮЧЕН' : '🎯 Автовыбор ВЫКЛЮЧЕН'); });
                $('hh-resume-matching').addEventListener('input', e => { this.settings.resumeTitleMatching = parseInt(e.target.value); $('hh-matching-value').textContent = this.settings.resumeTitleMatching + '%'; this.saveSettings(); });
                $('hh-auto-remember').addEventListener('change', e => { this.settings.autoRememberOrganizations = e.target.checked; this.saveSettings(); this.updateStatus(e.target.checked ? '✅ АВТОфильтр ВКЛЮЧЕН' : '⭕ АВТОфильтр выключен'); });
                $('hh-letter').addEventListener('input', e => { this.coverLetter = e.target.value; $('hh-char-count').textContent = e.target.value.length + '/2000'; this.saveSettings(); });
                $('hh-auto-next').addEventListener('change', e => { this.settings.autoNextPage = e.target.checked; this.saveSettings(); });
                $('hh-skip-responded').addEventListener('change', e => { this.settings.skipResponded = e.target.checked; this.saveSettings(); });
                $('hh-filter-organizations').addEventListener('change', e => { this.settings.filterOrganizations = e.target.checked; this.saveSettings(); });
                $('hh-delay').addEventListener('change', e => { this.settings.delay = parseFloat(e.target.value) || 0.5; this.saveSettings(); });
                $('hh-filter-text').addEventListener('input', e => { this.filteredOrganizations = e.target.value.split(',').map(o => o.trim()).filter(o => o); this.saveSettings(); });
                setInterval(() => this.updateCount(), 5000);
            }

            toggleSettings() {
                this.settingsCollapsed = !this.settingsCollapsed;
                const c = document.getElementById('hh-settings-content');
                const a = document.getElementById('hh-settings-arrow');
                if (c) c.style.display = this.settingsCollapsed ? 'none' : 'block';
                if (a) a.textContent = this.settingsCollapsed ? '▶' : '▼';
            }

            toggleTheme() { this.theme = this.theme === 'dark' ? 'light' : 'dark'; this.saveSettings(); }

            getOrganizationNameFromCard(b) {
                const card = b.closest('[data-qa="vacancy-serp__vacancy"]') || b.closest('[class*="vacancy-card"]') || b.closest('[class*="branded-snippet"]');
                if (!card) return null;
                const e = card.querySelector('[data-qa="vacancy-serp__vacancy-employer-text"]') || card.querySelector('a[href*="/employer/"]') || card.querySelector('[class*="employer"]');
                return e ? (e.textContent || '').replace(/\u00A0/g, ' ').trim() : null;
            }

            isFilteredOrganization(b) {
                if (!this.settings.filterOrganizations) return false;
                const o = this.getOrganizationNameFromCard(b);
                if (!o) return false;
                const ol = o.toLowerCase();
                for (const f of this.filteredOrganizations) { if (f && f.trim() && (ol.includes(f.toLowerCase()) || f.toLowerCase().includes(ol))) return true; }
                if (this.settings.autoRememberOrganizations) { for (const f of this.autoFilteredOrganizations) { if (f && f.trim() && (ol.includes(f.toLowerCase()) || f.toLowerCase().includes(ol))) return true; } }
                return false;
            }

            addToAutoFilter(o) { if (!o || !this.settings.autoRememberOrganizations) return false; const ot = o.trim(); if (!ot || this.autoFilteredOrganizations.some(x => x.toLowerCase() === ot.toLowerCase())) return false; this.autoFilteredOrganizations.push(ot); this.saveSettings(); return true; }

            showAutoFilter() {
                if (!this.autoFilteredOrganizations.length) { this.updateStatus('🤖 Автофильтр пуст'); return; }
                this.updateStatus('🤖 АВТОФИЛЬТР (' + this.autoFilteredOrganizations.length + '):\n' + this.autoFilteredOrganizations.map((o,i) => (i+1)+'. '+o).join('\n'));
            }

            clearAutoFilter() { if (this.autoFilteredOrganizations.length && confirm('Очистить автофильтр?')) { this.autoFilteredOrganizations = []; this.saveSettings(); this.updateStatus('🧹 Автофильтр очищен'); } }

            async closeChatIfOpened() { try { const b = document.querySelector('[data-qa="chatik-close-chatik"]'); if (b?.offsetParent) { b.click(); await this.wait(500); return true; } } catch(e) {} return false; }

            async checkAndCloseDirectResponseModal(o) {
                let d = false;
                const m1 = document.querySelector('[role="alertdialog"][aria-modal="true"]');
                if (m1) { const t = m1.querySelector('[data-qa="title"]'); if (t?.textContent.includes('прямым откликом')) d = true; }
                if (!d) { const m2 = document.querySelector('[data-qa="magritte-alert-title"]'); if (m2?.textContent.includes('прямым откликом')) d = true; }
                if (d) { if (o && this.settings.autoRememberOrganizations) this.addToAutoFilter(o); const cb = document.querySelector('[data-qa="vacancy-response-link-advertising-cancel"]') || document.querySelector('[aria-label="Закрыть"]'); if (cb) { cb.click(); await this.wait(500); return true; } document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', keyCode:27, bubbles:true })); await this.wait(500); return true; }
                return false;
            }

            getVacancyTitleFromModal() {
                for (const s of ['[data-qa="title-description"] .magritte-text_style-secondary','[data-qa="title-description"] .magritte-text','.magritte-modal-content [data-qa="title-description"]','[role="dialog"] [data-qa="title-description"]']) { const e = document.querySelector(s); if (e) { const t = e.textContent.trim(); if (t && t.length > 2 && t.length < 200 && !t.includes('Отклик')) return t; } }
                return null;
            }

            async openResumeDropdown() { const rc = document.querySelector('[data-qa="resume-title"]'); if (rc) { const cl = rc.closest('[role="button"],[tabindex="0"]'); if (cl) { cl.click(); await this.wait(600); const dd = document.querySelector('[role="listbox"]'); if (dd?.offsetParent) return true; } } return false; }
            async closeResumeDropdown() { document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', keyCode:27, bubbles:true })); await this.wait(300); }

            async getAllResumes() {
                const r = [];
                document.querySelectorAll('label[role="option"][data-interactive="true"]').forEach(i => { const te = i.querySelector('[data-qa="cell-text-content"]'); if (te) { const t = te.textContent.trim(); if (t) { const ra = i.querySelector('input[type="radio"]'); r.push({ element:i, title:t, isSelected: ra ? ra.checked : false }); } } });
                return r;
            }

            async selectBestResume(vt) {
                if (!this.settings.autoSelectResume || !vt) return false;
                const op = await this.openResumeDropdown(); if (!op) return false;
                await this.wait(500); const rs = await this.getAllResumes();
                if (rs.length <= 1) { await this.closeResumeDropdown(); return false; }
                let best = null, bs = 0; const vl = vt.toLowerCase();
                for (const r of rs) {
                    if (r.isSelected) continue; const tl = r.title.toLowerCase(); let s = 0;
                    if (tl === vl) s = 100; else if (vl.includes(tl)) s = 95; else if (tl.includes(vl)) s = 90;
                    else { const sw = ['прием','отправка','тмц','работа','сотрудник','специалист','помощник','и','с','по','на','в','для']; const vw = vl.split(/[\s,()\-/]+/).filter(w => w.length > 2 && !sw.includes(w)); const rw = tl.split(/[\s,()\-/]+/).filter(w => w.length > 2 && !sw.includes(w)); let m = 0; for (const v of vw) { for (const rr of rw) { if (v === rr || rr.includes(v) || v.includes(rr)) { m++; break; } } } if (vw.length > 0) s = (m / vw.length) * 100; }
                    if (s > bs) { bs = s; best = r; }
                }
                if (best && bs >= this.settings.resumeTitleMatching) { best.element.click(); await this.wait(500); }
                await this.closeResumeDropdown(); return best && bs >= this.settings.resumeTitleMatching;
            }

            async processResponse(o, depth = 0) {
                if (depth > 10) return false;
                try {
                    if (await this.checkAndCloseDirectResponseModal(o)) { this.stats.skipped++; this.updateStatsDisplay(); return false; }
                    for (let i = 0; i < 3; i++) { await this.closeChatIfOpened(); await this.wait(300); }
                    await this.wait(500);
                    if (this.settings.autoSelectResume && !this.resumeSelectedFlag) { const vt = this.getVacancyTitleFromModal(); if (vt) { await this.selectBestResume(vt); this.resumeSelectedFlag = true; await this.wait(500); } }
                    const ta = document.querySelector('[data-qa="vacancy-response-popup-form-letter-input"]');
                    if (ta) {
                        if (!this.settings.skipCoverLetter) { const ns = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; if (ns) { ns.call(ta, this.coverLetter); ta.dispatchEvent(new Event('input', { bubbles:true })); } else { ta.value = this.coverLetter; ta.dispatchEvent(new Event('input', { bubbles:true })); } await this.wait(500); }
                        const r = await this.submitResponse();
                        if (r && this.isLimitReached()) { this.updateStatus('🛑 Лимит 200 откликов. Остановка.'); this.stopAutoProcess(); return false; }
                        return r;
                    }
                    const al = document.querySelector('[data-qa="add-cover-letter"]'); if (al && !this.settings.skipCoverLetter) { al.click(); await this.wait(800); return await this.processResponse(o, depth + 1); }
                    const rl = document.querySelector('[data-qa="relocation-warning-confirm"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Все равно откликнуться')); if (rl) { rl.click(); await this.wait(800); return await this.processResponse(o, depth + 1); }
                    return await this.submitResponse();
                } catch(e) { this.stats.failed++; this.updateStatsDisplay(); await this.closeModal(); return false; }
            }

            async submitResponse() { const sb = document.querySelector('[data-qa="vacancy-response-submit-popup"]:not([disabled])') || document.querySelector('[data-qa="vacancy-response-submit-popup"]'); if (!sb) return false; if (sb.hasAttribute('disabled')) await this.wait(1000); sb.click(); await this.wait(2000); if (this.isLimitReached()) return false; return true; }
            async closeModal() { const b = document.querySelector('[data-qa="vacancy-response-popup-close"]') || document.querySelector('[aria-label="Закрыть"]'); if (b) { b.click(); await this.wait(300); } }

            updateStatus(m) { const el = document.getElementById('hh-status'); if (el) { el.textContent = m; el.style.whiteSpace = 'pre-line'; el.style.fontSize = m.length > 50 ? '11px' : '13px'; } }
            updateStatsDisplay() { const el = document.getElementById('hh-stats'); if (el) el.textContent = '✅'+this.stats.success+' ❌'+this.stats.failed+' ⏭️'+this.stats.skipped; this.saveSettings(); }
            updateCount() { const el = document.getElementById('hh-count'); if (el) el.textContent = this.getAvailableButtons().length; }

            updateControlButtons() {
                const s = document.getElementById('hh-start'), t = document.getElementById('hh-test'), p = document.getElementById('hh-stop');
                if (this.isRunning) {
                    if (s) s.style.display = 'none'; if (t) t.style.display = 'none'; if (p) p.style.display = 'block';
                    if (this.toggleButton) { this.toggleButton.classList.add('hh-toggle-running'); this.toggleButton.classList.remove('hh-toggle-stopped'); this.toggleButton.textContent = '⏹️'; }
                } else {
                    if (s) s.style.display = 'block'; if (t) t.style.display = 'block'; if (p) p.style.display = 'none';
                    if (this.toggleButton) { this.toggleButton.classList.add('hh-toggle-stopped'); this.toggleButton.classList.remove('hh-toggle-running'); this.toggleButton.textContent = '🚀'; }
                }
            }

            getAvailableButtons() {
                if (window.location.href.includes('/applicant/vacancy_response')) return [];
                return Array.from(document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]')).filter(b => {
                    if (!b.offsetParent || b.style.display === 'none') return false;
                    if (this.isFilteredOrganization(b)) return false;
                    if (this.isTestVacancy(b)) return false;
                    if (this.settings.skipResponded) { const p = b.closest('.vacancy-serp-item') || b.closest('[class*="vacancy-card"]'); if (p && ((p.innerText||'').includes('Вы откликнулись') || p.querySelector('[data-qa="vacancy-serp__vacancy_responded"]'))) return false; }
                    return true;
                });
            }

            async safeClick(b) { try { b.scrollIntoView({ behavior:'smooth', block:'center' }); await this.wait(300); b.click(); await this.wait(500); return true; } catch(e) { return false; } }

            // 🔴 ОСНОВНОЙ МЕТОД С IFRAME-ПРОВЕРКОЙ
            async processSingleVacancy(b, i, t) {
                if (!this.isRunning) return false;
                
                const lc = this.isLimitReached();
                if (lc) { this.updateStatus('🛑 Лимит. Остановка.'); this.stopAutoProcess(); return false; }
                
                const o = this.getOrganizationNameFromCard(b);
                const vacancyId = this.getVacancyId(b);
                const href = b.href || '';
                const empMatch = href.match(/employerId=(\d+)/);
                const employerId = empMatch ? empMatch[1] : '';
                
                if (vacancyId && this.skippedVacancies.has('id_' + vacancyId)) {
                    return false;
                }
                
                this.updateStatus('🔍 ' + (i+1) + '/' + t + ': проверка ' + (o || '...'));
                
                // 🔴 ПРОВЕРКА ТЕСТА ЧЕРЕЗ IFRAME (без ухода со страницы!)
                if (vacancyId && employerId) {
                    const checkResult = await this.checkTestViaIframe(vacancyId, employerId, o);
                    
                    if (checkResult.isTest) {
                        return false; // Тест — пропускаем
                    }
                }
                
                // Обычный клик
                this.updateStatus('🎯 ' + (i+1) + '/' + t + ': ' + (o || 'Обработка...'));
                
                if (!(await this.safeClick(b))) { 
                    this.stats.failed++; this.consecutiveErrors++; 
                    this.updateStatsDisplay(); return false; 
                }
                
                await this.wait(1500);
                
                const ok = await this.processResponse(o);
                
                if (ok) { 
                    this.consecutiveErrors = 0; 
                    if (o && this.settings.autoRememberOrganizations) this.addToAutoFilter(o); 
                    this.stats.success++; this.updateStatsDisplay(); 
                } else { 
                    this.consecutiveErrors++; this.stats.failed++; 
                    this.updateStatsDisplay();
                }
                
                await this.closeModal();
                
                if (window.location.href.includes('/applicant/vacancy_response')) {
                    window.history.back();
                }
                
                return ok;
            }

            async startAutoProcess() {
                if (this.isRunning) return; 
                this.isRunning = true; 
                this.updateControlButtons(); 
                this.updateStatus('🚀 Запуск...');
                
                try {
                    while (this.isRunning) {
                        await this.wait(1000);
                        
                        const bt = this.getAvailableButtons();
                        
                        if (!bt.length) { 
                            this.updateStatus('✅ Все обработаны'); 
                            if (this.settings.autoNextPage) { 
                                const n = document.querySelector('[data-qa="pager-next"]'); 
                                if (n) { 
                                    this.updateStatus('➡️ След. страница...'); 
                                    n.click(); 
                                    await this.wait(3000); 
                                    continue; 
                                } 
                            } 
                            this.updateStatus('🎉 Завершено!\n✅'+this.stats.success+' ❌'+this.stats.failed+' ⏭️'+this.stats.skipped); 
                            break; 
                        }
                        
                        for (let i = 0; i < bt.length && this.isRunning; i++) { 
                            await this.processSingleVacancy(bt[i], i, bt.length); 
                            if (i < bt.length-1 && this.isRunning) await this.wait(this.settings.delay*1000); 
                        }
                        await this.wait(800);
                    }
                } catch(e) { console.error(e); } 
                this.stopAutoProcess();
            }

            stopAutoProcess() { this.isRunning = false; this.updateControlButtons(); }
            
            async testProcess() { 
                const bt = this.getAvailableButtons(); 
                if (!bt.length) return; 
                this.isRunning = true; this.updateControlButtons();
                await this.processSingleVacancy(bt[0], 0, 1); 
                this.isRunning = false; this.updateControlButtons(); 
                this.updateStatus('✅ Тест завершён'); 
            }

            testFilter() {
                const bt = document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]'); 
                let r = '🔍 ТЕСТ ФИЛЬТРА:\n\n', f = 0;
                bt.forEach((b, i) => { const o = this.getOrganizationNameFromCard(b); if (this.isFilteredOrganization(b)) f++; r += (i+1) + '. ' + (o||'???') + ' - ' + (this.isFilteredOrganization(b)?'🚫 ЗАБЛОКИРОВАНА':'✅ РАЗРЕШЕНА') + '\n'; });
                r += '\n📊 ИТОГО: ' + f + ' из ' + bt.length + ' вакансий заблокировано фильтром'; 
                this.updateStatus(r);
            }

            analyzePage() { 
                const a = document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]').length; 
                this.updateStatus('📊 АНАЛИЗ:\nВсего: '+a+'\nДоступно: '+this.getAvailableButtons().length+'\n✅'+this.stats.success+' ❌'+this.stats.failed+' ⏭️'+this.stats.skipped); 
            }
            
            clearHistory() { 
                this.stopAutoProcess();
                this.processedVacancies.clear(); 
                this.skippedVacancies.clear(); 
                this.testEmployerIds.clear();
                try { 
                    localStorage.removeItem('hh-skipped-vacancies'); 
                    localStorage.removeItem('hh-test-employers');
                } catch(e) {}
                this.stats = { success:0, failed:0, skipped:0, total:0 }; 
                this.consecutiveErrors = 0; 
                this.updateStatsDisplay(); 
                this.updateStatus('🗑️ Всё очищено. Бот остановлен.'); 
            }
        }

        try { chrome.runtime.onMessage.addListener((r,s,res) => { if (r.action === 'checkConnection') res({connected:!!window.hhAutoResponder}); return true; }); } catch(e) {}

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(() => new HHAutoResponder(), 800));
        else setTimeout(() => new HHAutoResponder(), 800);
    });
})();