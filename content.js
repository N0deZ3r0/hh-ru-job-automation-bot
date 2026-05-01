// ===== HH AUTO RESPONDER v2.0 — BOT LOGIC =====
(function() {
    'use strict';

    if (!window.location.href.includes('hh.ru')) return;

    // Ждём готовности core
    function waitForCore() {
        return new Promise(resolve => {
            if (window.__HH_CORE_READY__) { resolve(); return; }
            window.addEventListener('hh-core-ready', resolve, { once: true });
        });
    }

    waitForCore().then(() => {
        console.log('=== HH Авто-отклик v2.0 ===');

        class HHAutoResponder {
            constructor() {
                this.coverLetter = "Добрый день! Заинтересовала ваша вакансия. Мой опыт соответствует требованиям. Готов(а) к собеседованию. С уважением, [Ваше Имя]";
                this.isRunning = false;
                this.processedVacancies = new Set();
                this.stats = { success: 0, failed: 0, skipped: 0, total: 0 };
                this.settings = { autoNextPage: true, skipResponded: true, delay: 0.5, filterOrganizations: true, autoRememberOrganizations: true, skipCoverLetter: false, autoSelectResume: true, resumeTitleMatching: 70 };
                this.filteredOrganizations = [];
                this.autoFilteredOrganizations = [];
                this.theme = 'dark';
                this.resumeSelectedFlag = false;
                this.settingsCollapsed = true;
                this.consecutiveErrors = 0;

                window.hhAutoResponder = this;
                this.init();
            }

            init() {
                this.loadSettings();
                this.createInterface();
                this.setupEventListeners();
                if (this.settings.resumeTitleMatching > 80) { this.settings.resumeTitleMatching = 70; this.saveSettings(); }
                const W = window.__HH_WASM__;
                this.updateStatus('✅ Готов к работе' + (W ? ' [WASM]' : ' [JS]'));
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
                const c = b.closest('[data-qa="vacancy-serp__vacancy"]') || b.closest('.vacancy-card--n77Dj8TY8VIUF0yM') || b.closest('[role="button"]');
                if (!c) return null;
                const e = c.querySelector('[data-qa="vacancy-serp__vacancy-employer-text"]') || c.querySelector('[data-qa="vacancy-serp__vacancy-employer"]') || c.querySelector('a[href*="/employer/"]');
                return e ? (e.textContent || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim() : null;
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

            async closeChatIfOpened() {
                try {
                    const b = document.querySelector('[data-qa="chatik-close-chatik"]');
                    if (b?.offsetParent) { b.click(); await this.wait(500); return true; }
                } catch(e) {} return false;
            }

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

            async openResumeDropdown() {
                const rc = document.querySelector('[data-qa="resume-title"]');
                if (rc) { const cl = rc.closest('[role="button"],[tabindex="0"]'); if (cl) { cl.click(); await this.wait(600); const dd = document.querySelector('[role="listbox"]'); if (dd?.offsetParent) return true; } }
                return false;
            }

            async closeResumeDropdown() { document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', keyCode:27, bubbles:true })); await this.wait(300); }

            async getAllResumes() {
                const r = [];
                document.querySelectorAll('label[role="option"][data-interactive="true"]').forEach(i => { const te = i.querySelector('[data-qa="cell-text-content"]'); if (te) { const t = te.textContent.trim(); if (t) { const ra = i.querySelector('input[type="radio"]'); r.push({ element:i, title:t, isSelected: ra ? ra.checked : false }); } } });
                return r;
            }

            async selectBestResume(vt) {
                if (!this.settings.autoSelectResume || !vt) return false;
                const op = await this.openResumeDropdown();
                if (!op) return false;
                await this.wait(500);
                const rs = await this.getAllResumes();
                if (rs.length <= 1) { await this.closeResumeDropdown(); return false; }
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
                        const sw = ['прием','отправка','тмц','работа','сотрудник','специалист','помощник','и','с','по','на','в','для'];
                        const vw = vl.split(/[\s,()\-/]+/).filter(w => w.length > 2 && !sw.includes(w));
                        const rw = tl.split(/[\s,()\-/]+/).filter(w => w.length > 2 && !sw.includes(w));
                        let m = 0;
                        for (const v of vw) { for (const r of rw) { if (v === r || r.includes(v) || v.includes(r)) { m++; break; } } }
                        if (vw.length > 0) s = (m / vw.length) * 100;
                    }
                    if (s > bs) { bs = s; best = r; }
                }
                if (best && bs >= this.settings.resumeTitleMatching) { best.element.click(); await this.wait(500); }
                await this.closeResumeDropdown();
                return best && bs >= this.settings.resumeTitleMatching;
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
                        if (!this.settings.skipCoverLetter) {
                            const ns = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
                            if (ns) { ns.call(ta, this.coverLetter); ta.dispatchEvent(new Event('input', { bubbles:true })); }
                            else { ta.value = this.coverLetter; ta.dispatchEvent(new Event('input', { bubbles:true })); }
                            await this.wait(500);
                        }
                        const r = await this.submitResponse();
                        if (r && this.isLimitReached()) { this.updateStatus('🛑 Достигнут лимит 200 откликов за 24 часа.\nОстановка.'); this.stopAutoProcess(); return false; }
                        return r;
                    }
                    const al = document.querySelector('[data-qa="add-cover-letter"]');
                    if (al && !this.settings.skipCoverLetter) { al.click(); await this.wait(800); return await this.processResponse(o, depth + 1); }
                    const rl = document.querySelector('[data-qa="relocation-warning-confirm"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Все равно откликнуться'));
                    if (rl) { rl.click(); await this.wait(800); return await this.processResponse(o, depth + 1); }
                    return await this.submitResponse();
                } catch(e) { this.stats.failed++; this.updateStatsDisplay(); await this.closeModal(); return false; }
            }

            async submitResponse() {
                const sb = document.querySelector('[data-qa="vacancy-response-submit-popup"]:not([disabled])') || document.querySelector('[data-qa="vacancy-response-submit-popup"]');
                if (!sb) return false;
                if (sb.hasAttribute('disabled')) await this.wait(1000);
                sb.click(); await this.wait(2000);
                if (this.isLimitReached()) return false;
                return true;
            }

            async closeModal() { const b = document.querySelector('[data-qa="vacancy-response-popup-close"]') || document.querySelector('[aria-label="Закрыть"]'); if (b) { b.click(); await this.wait(300); } }

            updateStatus(m) { const el = document.getElementById('hh-status'); if (el) { el.textContent = m; el.style.whiteSpace = 'pre-line'; el.style.fontSize = m.length > 50 ? '11px' : '13px'; } }

            updateStatsDisplay() { const el = document.getElementById('hh-stats'); if (el) el.textContent = '✅'+this.stats.success+' ❌'+this.stats.failed+' ⏭️'+this.stats.skipped; this.saveSettings(); }

            updateCount() { const el = document.getElementById('hh-count'); if (el) el.textContent = this.getAvailableButtons().length; }

            updateControlButtons() {
                const s = document.getElementById('hh-start'), t = document.getElementById('hh-test'), p = document.getElementById('hh-stop');
                if (this.isRunning) { if (s) s.style.display = 'none'; if (t) t.style.display = 'none'; if (p) p.style.display = 'block'; this.toggleButton.style.background = 'linear-gradient(135deg,#f44336,#d32f2f)'; this.toggleButton.textContent = '⏹️'; }
                else { const d = this.theme === 'dark'; if (s) s.style.display = 'block'; if (t) t.style.display = 'block'; if (p) p.style.display = 'none'; this.toggleButton.style.background = d ? 'linear-gradient(135deg,#333,#555)' : 'linear-gradient(135deg,#2196F3,#1976D2)'; this.toggleButton.textContent = '🚀'; }
            }

            getAvailableButtons() {
                return Array.from(document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]')).filter(b => {
                    if (!b.offsetParent || b.style.display === 'none') return false;
                    if (this.isFilteredOrganization(b)) return false;
                    if (this.settings.skipResponded) { const p = b.closest('.vacancy-serp-item'); if (p && ((p.innerText||'').includes('Вы откликнулись') || p.querySelector('[data-qa="vacancy-serp__vacancy_responded"]'))) return false; }
                    return true;
                });
            }

            isAlreadyRespondedVacancy(b) {
                if (!this.settings.skipResponded) return false;
                const p = b.closest('.vacancy-serp-item') || b.closest('.serp-item') || b.closest('[data-qa="vacancy-serp__vacancy"]');
                if (!p) return false;
                if (p.querySelector('[data-qa="vacancy-serp__vacancy_responded"]')) return true;
                const pt = p.innerText || p.textContent || '';
                if (pt.includes('Вы откликнулись') || pt.includes('Вы уже откликнулись') || pt.includes('Отклик отправлен')) return true;
                const bt = b.innerText || b.textContent || '';
                return !bt.includes('Откликнуться') && bt.trim() !== '';
            }

            async safeClick(b) { try { b.scrollIntoView({ behavior:'smooth', block:'center' }); await this.wait(300); b.click(); await this.wait(500); return true; } catch(e) { return false; } }

            async processSingleVacancy(b, i, t) {
                if (!this.isRunning) return false;
                const lc = this.isLimitReached();
                if (lc) { this.updateStatus((lc === 'limit_exceeded' || lc === 'limit_exceeded_text') ? '🛑 Достигнут лимит 200 откликов за 24 часа.\nОстановка.' : '🛑 Обнаружена ошибка.\nУспешно: ' + this.stats.success + '\nОстановка.'); this.stopAutoProcess(); return false; }
                this.resumeSelectedFlag = false;
                const o = this.getOrganizationNameFromCard(b);
                this.updateStatus('🎯 ' + (i+1) + '/' + t + ': ' + (o || 'Обработка...'));
                if (!(await this.safeClick(b))) { this.stats.failed++; this.consecutiveErrors++; this.updateStatsDisplay(); return false; }
                const ok = await this.processResponse(o);
                if (ok) { this.consecutiveErrors = 0; if (o && this.settings.autoRememberOrganizations) this.addToAutoFilter(o); this.stats.success++; this.updateStatsDisplay(); await this.closeModal(); return true; }
                else { this.consecutiveErrors++; this.stats.failed++; this.updateStatsDisplay();
                    const lc2 = this.isLimitReached();
                    if (lc2) { this.updateStatus((lc2 === 'limit_exceeded' || lc2 === 'limit_exceeded_text') ? '🛑 Достигнут лимит 200 откликов за 24 часа.\nОстановка.' : '🛑 Обнаружена ошибка.\nУспешно: ' + this.stats.success + '\nОстановка.'); this.stopAutoProcess(); }
                    await this.closeModal(); return false;
                }
            }

            async startAutoProcess() {
                if (this.isRunning) return;
                this.isRunning = true; this.updateControlButtons(); this.updateStatus('🚀 Запуск...');
                try {
                    while (this.isRunning) {
                        const bt = this.getAvailableButtons();
                        if (!bt.length) { this.updateStatus('✅ Все обработаны'); if (this.settings.autoNextPage) { const n = document.querySelector('[data-qa="pager-next"]'); if (n) { this.updateStatus('➡️ След. страница...'); n.click(); await this.wait(2000); continue; } } this.updateStatus('🎉 Завершено!\nУспешно: '+this.stats.success+'\nОшибок: '+this.stats.failed+'\nПропущено: '+this.stats.skipped); break; }
                        for (let i = 0; i < bt.length && this.isRunning; i++) { await this.processSingleVacancy(bt[i], i, bt.length); if (i < bt.length-1 && this.isRunning) await this.wait(this.settings.delay*1000); }
                        await this.wait(800);
                    }
                } catch(e) { console.error(e); }
                this.stopAutoProcess();
            }

            stopAutoProcess() { this.isRunning = false; this.updateControlButtons(); }

            async testProcess() { const bt = this.getAvailableButtons(); if (!bt.length) return; this.isRunning = true; await this.processSingleVacancy(bt[0], 0, 1); this.isRunning = false; this.updateControlButtons(); this.updateStatus('✅ Тест завершён'); }

            testFilter() {
                const bt = document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]');
                let r = '🔍 ТЕСТ ФИЛЬТРА:\n\n', f = 0;
                bt.forEach((b, i) => { const o = this.getOrganizationNameFromCard(b); if (this.isFilteredOrganization(b)) f++; r += (i+1) + '. ' + (o||'???') + ' - ' + (this.isFilteredOrganization(b)?'🚫 ЗАБЛОКИРОВАНА':'✅ РАЗРЕШЕНА') + '\n'; });
                r += '\n📊 ИТОГО: ' + f + ' из ' + bt.length + ' вакансий заблокировано фильтром';
                this.updateStatus(r);
            }

            analyzePage() { const a = document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]').length; this.updateStatus('📊 АНАЛИЗ:\nВсего: '+a+'\nДоступно: '+this.getAvailableButtons().length+'\nУспешно: '+this.stats.success+'\nОшибок: '+this.stats.failed+'\nПропущено: '+this.stats.skipped); }

            clearHistory() { this.processedVacancies.clear(); this.stats = { success:0, failed:0, skipped:0, total:0 }; this.consecutiveErrors = 0; this.updateStatsDisplay(); this.updateStatus('🗑️ Статистика очищена'); }
        }

        try { chrome.runtime.onMessage.addListener((r,s,res) => { if (r.action === 'checkConnection') res({connected:!!window.hhAutoResponder}); return true; }); } catch(e) {}

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(() => new HHAutoResponder(), 800));
        else setTimeout(() => new HHAutoResponder(), 800);
    });
})();