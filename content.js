// ===== HH АВТО-ОТКЛИК v1.3 (СВОРАЧИВАЕМЫЕ НАСТРОЙКИ) =====
(function() {
    'use strict';
    
    console.log('=== HH Авто-отклик v1.3 ===');
    
    if (!window.location.href.includes('hh.ru')) {
        console.log('⚠️ Не страница HH.ru, скрипт не активирован');
        return;
    }
    
    class HHAutoResponder {
        constructor() {
            this.coverLetter = `Добрый день! Заинтересовала ваша вакансия. Мой опыт соответствует требованиям. Готов(а) к собеседованию. С уважением, [Ваше Имя]`;
            this.isRunning = false;
            this.processedVacancies = new Set();
            this.stats = { success: 0, failed: 0, skipped: 0, total: 0 };
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
            this.settingsCollapsed = true; // Настройки свернуты по умолчанию
            
            window.hhAutoResponder = this;
            
            this.init();
        }
        
        init() {
            console.log('🎯 Инициализация HH Авто-отклика...');
            
            this.loadSettings();
            this.createInterface();
            this.setupEventListeners();
            
            if (this.settings.resumeTitleMatching > 80) {
                this.settings.resumeTitleMatching = 70;
                this.saveSettings();
            }
            
            console.log('✅ HH Авто-отклик готов к работе!');
            this.updateStatus('✅ Готов к работе на этой странице');
        }
        
        loadSettings() {
            try {
                const saved = localStorage.getItem('hh-auto-settings');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed.coverLetter) this.coverLetter = parsed.coverLetter;
                    if (parsed.settings) this.settings = { ...this.settings, ...parsed.settings };
                    if (parsed.stats) this.stats = { ...this.stats, ...parsed.stats };
                    if (parsed.theme) this.theme = parsed.theme;
                    if (parsed.filteredOrganizations) this.filteredOrganizations = parsed.filteredOrganizations;
                    if (parsed.autoFilteredOrganizations) this.autoFilteredOrganizations = parsed.autoFilteredOrganizations;
                }
            } catch (e) {}
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
            } catch (e) {}
        }
        
        wait(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        
        createInterface() {
            this.removeOldInterface();
            this.createPanel();
            this.createToggleButton();
            this.updateCount();
            this.updateStatsDisplay();
        }
        
        removeOldInterface() {
            const oldPanel = document.getElementById('hh-auto-panel');
            if (oldPanel) oldPanel.remove();
            const oldBtn = document.getElementById('hh-toggle-btn');
            if (oldBtn) oldBtn.remove();
        }
        
        createPanel() {
            this.panel = document.createElement('div');
            this.panel.id = 'hh-auto-panel';
            
            const isDark = this.theme === 'dark';
            const bgColor = isDark ? '#1e1e1e' : 'white';
            const textColor = isDark ? '#ffffff' : '#333333';
            const borderColor = isDark ? '#444444' : '#4CAF50';
            const statusBg = isDark ? '#2d2d2d' : '#f0f8ff';
            const statusColor = isDark ? '#ffffff' : '#333333';
            const secondaryText = isDark ? '#aaaaaa' : '#666666';
            const inputBg = isDark ? '#2d2d2d' : 'white';
            const inputBorder = isDark ? '#555555' : '#dddddd';
            
            Object.assign(this.panel.style, {
                position: 'fixed',
                top: '110px',
                right: '20px',
                zIndex: '10000',
                background: bgColor,
                color: textColor,
                border: `2px solid ${borderColor}`,
                borderRadius: '10px',
                padding: '15px',
                width: '340px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                fontFamily: 'Arial, sans-serif',
                maxHeight: '80vh',
                overflowY: 'auto',
                transition: 'all 0.3s'
            });
            
            // Стрелка для сворачивания настроек
            const settingsArrow = this.settingsCollapsed ? '▶' : '▼';
            
            this.panel.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <h3 style="margin: 0; color: #2196F3; font-size: 16px;">HH Авто-отклик v1.3</h3>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span id="hh-moon-icon" style="font-size: 14px; color: ${isDark ? '#4CAF50' : '#666'};">☀️</span>
                            <div id="hh-theme-slider" style="position: relative; width: 44px; height: 20px; cursor: pointer; border-radius: 12px; background: ${isDark ? '#2d2d2d' : '#e0e0e0'}; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);">
                                <div id="hh-theme-slider-handle" style="position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: ${isDark ? '#4CAF50' : '#FF9800'}; border-radius: 50%; transition: all 0.3s; transform: ${isDark ? 'translateX(22px)' : 'translateX(2px)'};"></div>
                            </div>
                            <span id="hh-sun-icon" style="font-size: 14px; color: ${isDark ? '#aaa' : '#FF9800'};">🌙</span>
                        </div>
                        <button id="hh-close-btn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: ${secondaryText};">×</button>
                    </div>
                </div>
                
                <div id="hh-status" style="background: ${statusBg}; color: ${statusColor}; padding: 10px; border-radius: 6px; font-size: 13px; min-height: 50px; margin-bottom: 10px; border: 1px solid ${inputBorder};">✅ Готов к работе</div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <div style="font-size: 12px; color: ${secondaryText};">🔍 Найдено: <span id="hh-count" style="font-weight: bold; color: ${textColor};">0</span></div>
                    <div id="hh-stats" style="font-size: 11px; color: ${secondaryText}; background: ${isDark ? '#2d2d2d' : '#f5f5f5'}; padding: 4px 8px; border-radius: 4px; border: 1px solid ${inputBorder};">✅0 ❌0 ⏭️0</div>
                </div>
                
                <div style="margin-bottom: 10px;">
                    <div style="font-weight: bold; font-size: 13px; margin-bottom: 5px; color: ${textColor}; display: flex; justify-content: space-between; align-items: center;">
                        <span>📝 Сопроводительное письмо:</span>
                        <label style="display: flex; align-items: center; gap: 5px; font-weight: normal; font-size: 12px; cursor: pointer;">
                            <input type="checkbox" id="hh-skip-cover-letter" ${this.settings.skipCoverLetter ? 'checked' : ''} style="cursor: pointer;">
                            <span style="color: ${this.settings.skipCoverLetter ? '#4CAF50' : secondaryText};">🚫 Не отправлять</span>
                        </label>
                    </div>
                    <textarea id="hh-letter" style="width: 100%; height: 100px; padding: 8px; border: 1px solid ${inputBorder}; border-radius: 4px; font-size: 13px; resize: vertical; background: ${inputBg}; color: ${textColor}; ${this.settings.skipCoverLetter ? 'opacity: 0.5; pointer-events: none;' : ''}">${this.coverLetter}</textarea>
                    <div style="font-size: 11px; color: ${secondaryText}; margin-top: 3px; display: flex; justify-content: space-between;">
                        <span>* Укажите своё настоящее имя</span>
                        <span id="hh-char-count">${this.coverLetter.length}/2000</span>
                    </div>
                </div>
                
                <!-- СВОРАЧИВАЕМЫЙ БЛОК НАСТРОЕК -->
                <div style="margin-bottom: 10px;">
                    <div id="hh-settings-header" style="font-weight: bold; font-size: 13px; margin: 10px 0 5px 0; color: ${textColor}; cursor: pointer; display: flex; align-items: center; gap: 8px; user-select: none;">
                        <span id="hh-settings-arrow" style="font-size: 14px; transition: transform 0.2s;">${settingsArrow}</span>
                        <span>⚙️ Настройки</span>
                    </div>
                    <div id="hh-settings-content" style="margin-left: 20px; ${this.settingsCollapsed ? 'display: none;' : ''}">
                        <label style="display: flex; align-items: center; font-size: 13px; margin-bottom: 5px; color: ${textColor}; cursor: pointer;">
                            <input type="checkbox" id="hh-auto-next" ${this.settings.autoNextPage ? 'checked' : ''} style="margin-right: 8px;">
                            Автопереход на следующую страницу
                        </label>
                        <label style="display: flex; align-items: center; font-size: 13px; margin-bottom: 5px; color: ${textColor}; cursor: pointer;">
                            <input type="checkbox" id="hh-skip-responded" ${this.settings.skipResponded ? 'checked' : ''} style="margin-right: 8px;">
                            Пропускать уже откликнутые
                        </label>
                        <label style="display: flex; align-items: center; font-size: 13px; margin-bottom: 5px; color: ${textColor}; cursor: pointer;">
                            <input type="checkbox" id="hh-filter-organizations" ${this.settings.filterOrganizations ? 'checked' : ''} style="margin-right: 8px;">
                            Фильтровать организации
                        </label>
                        <label style="display: flex; align-items: center; font-size: 13px; margin-bottom: 5px; color: ${textColor}; cursor: pointer;">
                            <input type="checkbox" id="hh-auto-remember" ${this.settings.autoRememberOrganizations ? 'checked' : ''} style="margin-right: 8px;">
                            <strong>Автодобавление в фильтр</strong>
                        </label>
                        <label style="display: flex; align-items: center; font-size: 13px; margin-bottom: 5px; color: ${textColor}; cursor: pointer;">
                            <input type="checkbox" id="hh-auto-select-resume" ${this.settings.autoSelectResume ? 'checked' : ''} style="margin-right: 8px;">
                            <strong>🎯 Автовыбор резюме</strong>
                        </label>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px; color: ${textColor};">
                            <span style="font-size: 12px;">Порог совпадения:</span>
                            <input type="range" id="hh-resume-matching" min="0" max="100" step="5" value="${this.settings.resumeTitleMatching}" style="width: 100px;">
                            <span id="hh-matching-value" style="font-size: 12px;">${this.settings.resumeTitleMatching}%</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; color: ${textColor};">
                            <span style="font-size: 13px;">Задержка (сек):</span>
                            <input type="number" id="hh-delay" min="0.3" max="5" step="0.1" value="${this.settings.delay}" style="width: 50px; padding: 4px; border: 1px solid ${inputBorder}; border-radius: 4px; background: ${inputBg}; color: ${textColor}; text-align: center;">
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom: 10px;">
                    <div style="font-weight: bold; font-size: 13px; margin-bottom: 5px; color: ${textColor};">🚫 Фильтр организаций (ручной):</div>
                    <textarea id="hh-filter-text" placeholder="Введите названия организаций через запятую&#10;Пример: Яндекс, Google, Специальные технологии" style="width: 100%; height: 80px; padding: 8px; border: 1px solid ${inputBorder}; border-radius: 4px; font-size: 13px; resize: vertical; background: ${inputBg}; color: ${textColor};">${this.filteredOrganizations.join(', ')}</textarea>
                    <div style="font-size: 11px; color: ${secondaryText}; margin-top: 3px;">* Не откликаться на эти организации (полное или частичное совпадение)</div>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 8px; margin: 15px 0 10px 0;">
                    <button id="hh-start" style="padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">▶️ НАЧАТЬ АВТО-ОТКЛИК</button>
                    <button id="hh-test" style="padding: 10px; background: #FF9800; color: white; border: none; border-radius: 6px; cursor: pointer;">🧪 Тест на 1 вакансию</button>
                    <button id="hh-stop" style="padding: 12px; background: #f44336; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; display: none;">⏹️ ОСТАНОВИТЬ</button>
                </div>
                
                <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                    <button id="hh-analyze" style="flex: 1; padding: 8px; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer;">📊 Анализ</button>
                    <button id="hh-test-filter" style="flex: 1; padding: 8px; background: #9C27B0; color: white; border: none; border-radius: 6px; cursor: pointer;">🔍 Тест фильтра</button>
                    <button id="hh-show-auto-filter" style="flex: 1; padding: 8px; background: #00BCD4; color: white; border: none; border-radius: 6px; cursor: pointer;">🤖 Автофильтр</button>
                </div>
                
                <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                    <button id="hh-clear" style="flex: 1; padding: 8px; background: #607D8B; color: white; border: none; border-radius: 6px; cursor: pointer;">🗑️ Очистить статистику</button>
                    <button id="hh-clear-auto-filter" style="flex: 1; padding: 8px; background: #f44336; color: white; border: none; border-radius: 6px; cursor: pointer;">🧹 Очистить автофильтр</button>
                </div>
                
                <div style="margin-top: 15px; font-size: 11px; color: ${secondaryText}; text-align: center; border-top: 1px solid ${inputBorder}; padding-top: 10px;">By ALEX</div>
            `;
            
            document.body.appendChild(this.panel);
        }
        
        createToggleButton() {
            this.toggleButton = document.createElement('button');
            this.toggleButton.id = 'hh-toggle-btn';
            this.toggleButton.innerHTML = '🚀';
            
            const isDark = this.theme === 'dark';
            const btnBg = isDark ? 'linear-gradient(135deg, #333, #555)' : 'linear-gradient(135deg, #2196F3, #1976D2)';
            
            Object.assign(this.toggleButton.style, {
                position: 'fixed',
                top: '50px',
                right: '20px',
                zIndex: '9999',
                background: btnBg,
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '50px',
                height: '50px',
                fontSize: '24px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            });
            
            document.body.appendChild(this.toggleButton);
        }
        
        setupEventListeners() {
            this.toggleButton.addEventListener('click', () => {
                this.panel.style.display = this.panel.style.display === 'none' ? 'block' : 'none';
            });
            
            document.getElementById('hh-close-btn').addEventListener('click', () => {
                this.panel.style.display = 'none';
            });
            
            // Сворачивание настроек
            const settingsHeader = document.getElementById('hh-settings-header');
            if (settingsHeader) {
                settingsHeader.addEventListener('click', () => {
                    this.toggleSettings();
                });
            }
            
            const themeSlider = document.getElementById('hh-theme-slider');
            if (themeSlider) {
                themeSlider.addEventListener('click', () => {
                    this.toggleTheme();
                    this.applyThemeWithoutReload();
                });
            }
            
            document.getElementById('hh-start').addEventListener('click', () => this.startAutoProcess());
            document.getElementById('hh-test').addEventListener('click', () => this.testProcess());
            document.getElementById('hh-stop').addEventListener('click', () => this.stopAutoProcess());
            document.getElementById('hh-analyze').addEventListener('click', () => this.analyzePage());
            document.getElementById('hh-test-filter').addEventListener('click', () => this.testFilter());
            document.getElementById('hh-show-auto-filter').addEventListener('click', () => this.showAutoFilter());
            document.getElementById('hh-clear').addEventListener('click', () => this.clearHistory());
            document.getElementById('hh-clear-auto-filter').addEventListener('click', () => this.clearAutoFilter());
            
            document.getElementById('hh-skip-cover-letter').addEventListener('change', (e) => {
                this.settings.skipCoverLetter = e.target.checked;
                this.saveSettings();
                
                const textarea = document.getElementById('hh-letter');
                const skipLabel = e.target.closest('label').querySelector('span');
                
                if (textarea) {
                    if (this.settings.skipCoverLetter) {
                        textarea.style.opacity = '0.5';
                        textarea.style.pointerEvents = 'none';
                        if (skipLabel) skipLabel.style.color = '#4CAF50';
                        this.updateStatus('📝 Сопроводительное письмо ОТКЛЮЧЕНО');
                    } else {
                        textarea.style.opacity = '1';
                        textarea.style.pointerEvents = 'auto';
                        if (skipLabel) skipLabel.style.color = '';
                        this.updateStatus('📝 Сопроводительное письмо ВКЛЮЧЕНО');
                    }
                }
            });
            
            document.getElementById('hh-auto-select-resume').addEventListener('change', (e) => {
                this.settings.autoSelectResume = e.target.checked;
                this.saveSettings();
                this.updateStatus(e.target.checked ? '🎯 Автовыбор резюме ВКЛЮЧЕН' : '🎯 Автовыбор резюме ВЫКЛЮЧЕН');
            });
            
            document.getElementById('hh-resume-matching').addEventListener('input', (e) => {
                this.settings.resumeTitleMatching = parseInt(e.target.value);
                document.getElementById('hh-matching-value').textContent = this.settings.resumeTitleMatching + '%';
                this.saveSettings();
            });
            
            document.getElementById('hh-auto-remember').addEventListener('change', (e) => {
                this.settings.autoRememberOrganizations = e.target.checked;
                this.saveSettings();
                this.updateStatus(e.target.checked ? '✅ АВТОфильтр ВКЛЮЧЕН' : '⭕ АВТОфильтр выключен');
            });
            
            document.getElementById('hh-letter').addEventListener('input', (e) => {
                this.coverLetter = e.target.value;
                document.getElementById('hh-char-count').textContent = `${e.target.value.length}/2000`;
                this.saveSettings();
            });
            
            document.getElementById('hh-auto-next').addEventListener('change', (e) => {
                this.settings.autoNextPage = e.target.checked;
                this.saveSettings();
            });
            
            document.getElementById('hh-skip-responded').addEventListener('change', (e) => {
                this.settings.skipResponded = e.target.checked;
                this.saveSettings();
            });
            
            document.getElementById('hh-filter-organizations').addEventListener('change', (e) => {
                this.settings.filterOrganizations = e.target.checked;
                this.saveSettings();
            });
            
            document.getElementById('hh-delay').addEventListener('change', (e) => {
                this.settings.delay = parseFloat(e.target.value) || 0.5;
                this.saveSettings();
            });
            
            document.getElementById('hh-filter-text').addEventListener('input', (e) => {
                const text = e.target.value;
                this.filteredOrganizations = text.split(',').map(org => org.trim()).filter(org => org.length > 0);
                this.saveSettings();
            });
            
            setInterval(() => this.updateCount(), 5000);
        }
        
        toggleSettings() {
            this.settingsCollapsed = !this.settingsCollapsed;
            const content = document.getElementById('hh-settings-content');
            const arrow = document.getElementById('hh-settings-arrow');
            
            if (content) {
                content.style.display = this.settingsCollapsed ? 'none' : 'block';
            }
            if (arrow) {
                arrow.textContent = this.settingsCollapsed ? '▶' : '▼';
                arrow.style.transform = this.settingsCollapsed ? 'rotate(0deg)' : 'rotate(90deg)';
            }
        }
        
        toggleTheme() {
            this.theme = this.theme === 'dark' ? 'light' : 'dark';
            this.saveSettings();
            this.updateStatus(`✅ Тема изменена на ${this.theme === 'dark' ? 'тёмную' : 'светлую'}`);
        }
        
        applyThemeWithoutReload() {
            const isDark = this.theme === 'dark';
            
            const handle = document.getElementById('hh-theme-slider-handle');
            const moonIcon = document.getElementById('hh-moon-icon');
            const sunIcon = document.getElementById('hh-sun-icon');
            const slider = document.getElementById('hh-theme-slider');
            
            if (handle) {
                handle.style.transform = isDark ? 'translateX(22px)' : 'translateX(2px)';
                handle.style.background = isDark ? '#4CAF50' : '#FF9800';
            }
            if (moonIcon) moonIcon.style.color = isDark ? '#4CAF50' : '#666';
            if (sunIcon) sunIcon.style.color = isDark ? '#aaa' : '#FF9800';
            if (slider) slider.style.background = isDark ? '#2d2d2d' : '#e0e0e0';
            
            const bgColor = isDark ? '#1e1e1e' : 'white';
            const textColor = isDark ? '#ffffff' : '#333333';
            const borderColor = isDark ? '#444444' : '#4CAF50';
            const statusBg = isDark ? '#2d2d2d' : '#f0f8ff';
            const statusColor = isDark ? '#ffffff' : '#333333';
            const secondaryText = isDark ? '#aaaaaa' : '#666666';
            const inputBg = isDark ? '#2d2d2d' : 'white';
            const inputBorder = isDark ? '#555555' : '#dddddd';
            
            this.panel.style.background = bgColor;
            this.panel.style.color = textColor;
            this.panel.style.borderColor = borderColor;
            
            const statusEl = document.getElementById('hh-status');
            if (statusEl) {
                statusEl.style.background = statusBg;
                statusEl.style.color = statusColor;
                statusEl.style.borderColor = inputBorder;
            }
            
            const statsEl = document.getElementById('hh-stats');
            if (statsEl) {
                statsEl.style.background = isDark ? '#2d2d2d' : '#f5f5f5';
                statsEl.style.borderColor = inputBorder;
            }
            
            const textarea = document.getElementById('hh-letter');
            const delayInput = document.getElementById('hh-delay');
            const filterTextarea = document.getElementById('hh-filter-text');
            
            if (textarea) {
                textarea.style.background = inputBg;
                textarea.style.color = textColor;
                textarea.style.borderColor = inputBorder;
            }
            if (delayInput) {
                delayInput.style.background = inputBg;
                delayInput.style.color = textColor;
                delayInput.style.borderColor = inputBorder;
            }
            if (filterTextarea) {
                filterTextarea.style.background = inputBg;
                filterTextarea.style.color = textColor;
                filterTextarea.style.borderColor = inputBorder;
            }
            
            const countEl = document.getElementById('hh-count');
            if (countEl) countEl.style.color = textColor;
            
            const btnBg = isDark ? 'linear-gradient(135deg, #333, #555)' : 'linear-gradient(135deg, #2196F3, #1976D2)';
            this.toggleButton.style.background = btnBg;
        }
        
        // ===== ОСТАЛЬНЫЕ МЕТОДЫ (ТЕ ЖЕ, ЧТО И В v1.3.3) =====
        // ... (getOrganizationName, isFilteredOrganization, addToAutoFilter, showAutoFilter, clearAutoFilter, closeChatIfOpened, getVacancyTitleFromModal, openResumeDropdown, closeResumeDropdown, getAllResumes, selectBestResume, processResponse, submitResponse, closeModal, updateStatus, updateStatsDisplay, updateCount, updateControlButtons, getAvailableButtons, isAlreadyRespondedVacancy, safeClick, processSingleVacancy, startAutoProcess, stopAutoProcess, testProcess, testFilter, analyzePage, clearHistory)
        
        // Для краткости, остальные методы такие же как в v1.3.3
        // Они будут добавлены ниже...
        
        getOrganizationName(button) {
            const vacancyItem = button.closest('.vacancy-serp-item') || 
                               button.closest('.serp-item') ||
                               button.closest('[data-qa="vacancy-serp__vacancy"]');
            if (!vacancyItem) return null;
            
            const orgElement = vacancyItem.querySelector('[data-qa="vacancy-serp__vacancy-employer-text"]');
            if (orgElement) {
                let text = orgElement.textContent || orgElement.innerText || '';
                text = text.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                if (text) return text;
            }
            
            const employerLink = vacancyItem.querySelector('[data-qa="vacancy-serp__vacancy-employer"]');
            if (employerLink) {
                let text = employerLink.textContent || employerLink.innerText || '';
                text = text.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                if (text) return text;
            }
            
            const magritteElements = vacancyItem.querySelectorAll('.magritte-text');
            for (const element of magritteElements) {
                let text = element.textContent || element.innerText || '';
                text = text.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                if (text && !text.includes('₽') && !text.includes('отклик') && !text.includes('просмотр') && text.length > 1 && text.length < 100) {
                    return text;
                }
            }
            return null;
        }
        
        isFilteredOrganization(button) {
            if (!this.settings.filterOrganizations) return false;
            
            const organizationName = this.getOrganizationName(button);
            if (!organizationName) return false;
            
            const orgNameNormalized = organizationName.replace(/\s+/g, ' ').toLowerCase().trim();
            
            for (const filter of this.filteredOrganizations) {
                if (!filter || !filter.trim()) continue;
                const filterNormalized = filter.toLowerCase().trim();
                if (orgNameNormalized === filterNormalized || orgNameNormalized.includes(filterNormalized) || filterNormalized.includes(orgNameNormalized)) {
                    console.log(`🚫 Фильтр: "${organizationName}" заблокирована`);
                    return true;
                }
            }
            
            if (this.settings.autoRememberOrganizations) {
                for (const autoFilter of this.autoFilteredOrganizations) {
                    if (!autoFilter || !autoFilter.trim()) continue;
                    const autoFilterNormalized = autoFilter.toLowerCase().trim();
                    if (orgNameNormalized === autoFilterNormalized || orgNameNormalized.includes(autoFilterNormalized) || autoFilterNormalized.includes(orgNameNormalized)) {
                        console.log(`🚫 Автофильтр: "${organizationName}" заблокирована`);
                        return true;
                    }
                }
            }
            return false;
        }
        
        addToAutoFilter(organizationName) {
            if (!organizationName) return false;
            
            const orgNameTrimmed = organizationName.trim();
            if (!orgNameTrimmed) return false;
            
            const orgNameLower = orgNameTrimmed.toLowerCase();
            const alreadyExists = this.autoFilteredOrganizations.some(org => org.toLowerCase() === orgNameLower);
            
            if (alreadyExists) return false;
            
            this.autoFilteredOrganizations.push(orgNameTrimmed);
            this.saveSettings();
            console.log(`🤖 Добавлено в автофильтр: "${orgNameTrimmed}"`);
            return true;
        }
        
        showAutoFilter() {
            if (this.autoFilteredOrganizations.length === 0) {
                this.updateStatus('Автофильтр пуст');
                return;
            }
            let message = `АВТОФИЛЬТР (всего: ${this.autoFilteredOrganizations.length}):\n\n`;
            this.autoFilteredOrganizations.forEach((org, index) => { message += `${index + 1}. ${org}\n`; });
            message += `\n⚠️ Эти организации будут автоматически пропускаться в будущем.`;
            this.updateStatus(message);
        }
        
        clearAutoFilter() {
            if (this.autoFilteredOrganizations.length === 0) {
                this.updateStatus('Автофильтр уже пуст');
                return;
            }
            if (confirm(`Очистить автофильтр?\n\nУдалить ${this.autoFilteredOrganizations.length} организаций?`)) {
                const count = this.autoFilteredOrganizations.length;
                this.autoFilteredOrganizations = [];
                this.saveSettings();
                this.updateStatus(`🗑️ Автофильтр очищен (удалено ${count} организаций)`);
            }
        }
        
        async closeChatIfOpened() {
            try {
                let closeButton = document.querySelector('[data-qa="chatik-close-chatik"]');
                if (closeButton && closeButton.offsetParent !== null) {
                    console.log('🚫 Закрываем чат (data-qa)');
                    closeButton.click();
                    await this.wait(500);
                    return true;
                }
                
                const chatRoot = document.querySelector('[data-qa="chatik-root"]');
                if (chatRoot) {
                    const closeBtn = chatRoot.querySelector('button[aria-label="close"], button[aria-label="Закрыть"]');
                    if (closeBtn) {
                        console.log('🚫 Закрываем чат (aria-label)');
                        closeBtn.click();
                        await this.wait(500);
                        return true;
                    }
                }
                
                const allButtons = document.querySelectorAll('button');
                for (const btn of allButtons) {
                    const svg = btn.querySelector('svg');
                    if (svg) {
                        const svgPath = svg.innerHTML;
                        if (svgPath && (svgPath.includes('M18 6L6 18') || svgPath.includes('M6 6L18 18'))) {
                            console.log('🚫 Закрываем чат (иконка крестика)');
                            btn.click();
                            await this.wait(500);
                            return true;
                        }
                    }
                }
                return false;
            } catch (e) {
                console.log('Ошибка при закрытии чата:', e);
                return false;
            }
        }
        
        getVacancyTitleFromModal() {
            const selectors = [
                '[data-qa="title-description"] .magritte-text_style-secondary',
                '[data-qa="title-description"] .magritte-text',
                '.magritte-modal-content [data-qa="title-description"]',
                '[role="dialog"] [data-qa="title-description"]'
            ];
            
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    const title = element.textContent.trim();
                    if (title && title.length > 2 && title.length < 200 && !title.includes('Отклик')) {
                        console.log('Название вакансии из модалки:', title);
                        return title;
                    }
                }
            }
            
            const modal = document.querySelector('[role="dialog"]');
            if (modal) {
                const textElements = modal.querySelectorAll('.magritte-text_style-secondary');
                for (const el of textElements) {
                    const text = el.textContent.trim();
                    if (text && text.length > 3 && text.length < 200 && !text.includes('Отклик') && !text.includes('руб')) {
                        console.log('Название вакансии (альт):', text);
                        return text;
                    }
                }
            }
            return null;
        }
        
        async openResumeDropdown() {
            console.log('Открываем список резюме...');
            const resumeCard = document.querySelector('[data-qa="resume-title"]');
            if (resumeCard) {
                const clickable = resumeCard.closest('[role="button"], [tabindex="0"]');
                if (clickable) {
                    clickable.click();
                    await this.wait(600);
                    const dropdown = document.querySelector('[role="listbox"]');
                    if (dropdown && dropdown.offsetParent !== null) {
                        console.log('Список резюме открыт');
                        return true;
                    }
                }
            }
            console.log('Не удалось открыть список резюме');
            return false;
        }
        
        async closeResumeDropdown() {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, which: 27, bubbles: true }));
            await this.wait(300);
            return true;
        }
        
        async getAllResumes() {
            const resumes = [];
            const items = document.querySelectorAll('label[role="option"][data-interactive="true"]');
            
            for (const item of items) {
                const titleEl = item.querySelector('[data-qa="cell-text-content"]');
                if (titleEl) {
                    const title = titleEl.textContent.trim();
                    if (title) {
                        const radio = item.querySelector('input[type="radio"]');
                        resumes.push({
                            element: item,
                            title: title,
                            isSelected: radio ? radio.checked : false
                        });
                    }
                }
            }
            return resumes;
        }
        
        async selectBestResume(vacancyTitle) {
            if (!this.settings.autoSelectResume || !vacancyTitle) return false;
            
            console.log(`🎯 Выбор резюме для вакансии: "${vacancyTitle}"`);
            console.log(`📊 Порог совпадения: ${this.settings.resumeTitleMatching}%`);
            
            const opened = await this.openResumeDropdown();
            if (!opened) return false;
            
            await this.wait(500);
            const resumes = await this.getAllResumes();
            console.log(`📋 Найдено резюме: ${resumes.length}`);
            
            if (resumes.length <= 1) {
                console.log('Только одно резюме, переключение не нужно');
                await this.closeResumeDropdown();
                return false;
            }
            
            let bestMatch = null;
            let bestScore = 0;
            
            for (const resume of resumes) {
                if (resume.isSelected) {
                    console.log(`  📌 Текущее: "${resume.title}" (уже выбрано)`);
                    continue;
                }
                
                const vacancyLower = vacancyTitle.toLowerCase();
                const resumeLower = resume.title.toLowerCase();
                let score = 0;
                
                if (resumeLower === vacancyLower) {
                    score = 100;
                } else if (vacancyLower.includes(resumeLower)) {
                    score = 95;
                } else if (resumeLower.includes(vacancyLower)) {
                    score = 90;
                } else {
                    const stopWords = ['прием', 'отправка', 'тмц', 'работа', 'сотрудник', 'специалист', 'помощник', 'и', 'с', 'по', 'на', 'в', 'для'];
                    let vacancyWords = vacancyLower.split(/[\s,()\-/]+/).filter(w => w.length > 2);
                    let resumeWords = resumeLower.split(/[\s,()\-/]+/).filter(w => w.length > 2);
                    vacancyWords = vacancyWords.filter(w => !stopWords.includes(w));
                    resumeWords = resumeWords.filter(w => !stopWords.includes(w));
                    
                    let matches = 0;
                    for (const vw of vacancyWords) {
                        for (const rw of resumeWords) {
                            if (vw === rw || rw.includes(vw) || vw.includes(rw)) {
                                matches++;
                                break;
                            }
                        }
                    }
                    if (vacancyWords.length > 0) score = (matches / vacancyWords.length) * 100;
                }
                
                console.log(`  "${resume.title}" → ${Math.round(score)}%`);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = resume;
                }
            }
            
            console.log(`🏆 Лучшее совпадение: ${bestMatch ? bestMatch.title : 'нет'} (${Math.round(bestScore)}%)`);
            console.log(`🎯 Порог: ${this.settings.resumeTitleMatching}%`);
            
            if (bestMatch && bestScore >= this.settings.resumeTitleMatching) {
                console.log(`✅ ВЫБИРАЕМ: "${bestMatch.title}" (${Math.round(bestScore)}% >= ${this.settings.resumeTitleMatching}%)`);
                bestMatch.element.click();
                await this.wait(500);
                await this.closeResumeDropdown();
                return true;
            }
            
            console.log(`❌ Не выбрано: ${Math.round(bestScore)}% < ${this.settings.resumeTitleMatching}%`);
            await this.closeResumeDropdown();
            return false;
        }
        
        async processResponse() {
            console.log('🔄 Обработка отклика...');
            
            for (let i = 0; i < 3; i++) {
                await this.closeChatIfOpened();
                await this.wait(300);
            }
            await this.wait(500);
            
            if (this.settings.autoSelectResume && !this.resumeSelectedFlag) {
                const vacancyTitle = this.getVacancyTitleFromModal();
                if (vacancyTitle) {
                    await this.selectBestResume(vacancyTitle);
                    this.resumeSelectedFlag = true;
                    await this.wait(500);
                }
            }
            
            const textarea = document.querySelector('[data-qa="vacancy-response-popup-form-letter-input"]');
            
            if (textarea) {
                console.log('📝 Найдено поле для письма');
                
                if (!this.settings.skipCoverLetter) {
                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                    if (nativeSetter) {
                        nativeSetter.call(textarea, this.coverLetter);
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        textarea.value = this.coverLetter;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    this.updateStatus('📝 Письмо добавлено');
                    await this.wait(500);
                }
                
                return await this.submitResponse();
            }
            
            const addLetterButton = document.querySelector('[data-qa="add-cover-letter"]');
            
            if (addLetterButton && !this.settings.skipCoverLetter) {
                console.log('📝 Нажимаем "Добавить сопроводительное"');
                addLetterButton.click();
                await this.wait(800);
                return await this.processResponse();
            }
            
            const relocationButton = document.querySelector('[data-qa="relocation-warning-confirm"]') ||
                                     Array.from(document.querySelectorAll('button')).find(btn => 
                                         btn.textContent && btn.textContent.trim() === 'Все равно откликнуться');
            
            if (relocationButton) {
                console.log('📍 Подтверждаем переезд');
                relocationButton.click();
                await this.wait(800);
                return await this.processResponse();
            }
            
            return await this.submitResponse();
        }
        
        async submitResponse() {
            console.log('📤 Отправка отклика...');
            this.updateStatus('📤 Отправляем...');
            
            try {
                let submitButton = document.querySelector('[data-qa="vacancy-response-submit-popup"]:not([disabled])');
                if (!submitButton) submitButton = document.querySelector('[data-qa="vacancy-response-submit-popup"]');
                if (!submitButton) {
                    console.log('Кнопка отправки не найдена');
                    return false;
                }
                
                if (submitButton.hasAttribute('disabled')) {
                    console.log('Кнопка заблокирована, ждём...');
                    await this.wait(1000);
                }
                
                submitButton.click();
                await this.wait(1200);
                
                if (!document.querySelector('[data-qa="vacancy-response-popup"]')) {
                    console.log('Отклик успешно отправлен');
                    return true;
                }
                
                console.log('Отклик отправлен');
                return true;
            } catch (e) {
                console.log('Ошибка отправки:', e);
                return false;
            }
        }
        
        async closeModal() {
            const closeBtn = document.querySelector('[data-qa="vacancy-response-popup-close"]') ||
                            document.querySelector('.modal-close') ||
                            document.querySelector('[aria-label="Закрыть"]');
            if (closeBtn) {
                closeBtn.click();
                await this.wait(300);
            }
        }
        
        updateStatus(message) {
            const statusEl = document.getElementById('hh-status');
            if (statusEl) statusEl.textContent = message;
            console.log('Статус:', message);
        }
        
        updateStatsDisplay() {
            const statsEl = document.getElementById('hh-stats');
            if (statsEl) statsEl.textContent = `✅${this.stats.success} ❌${this.stats.failed} ⏭️${this.stats.skipped}`;
            this.saveSettings();
        }
        
        updateCount() {
            const countEl = document.getElementById('hh-count');
            if (countEl) countEl.textContent = this.getAvailableButtons().length;
        }
        
        updateControlButtons() {
            const startBtn = document.getElementById('hh-start');
            const testBtn = document.getElementById('hh-test');
            const stopBtn = document.getElementById('hh-stop');
            
            if (this.isRunning) {
                if (startBtn) startBtn.style.display = 'none';
                if (testBtn) testBtn.style.display = 'none';
                if (stopBtn) stopBtn.style.display = 'block';
                this.toggleButton.style.background = 'linear-gradient(135deg, #f44336, #d32f2f)';
                this.toggleButton.textContent = '⏹️';
            } else {
                const isDark = this.theme === 'dark';
                if (startBtn) startBtn.style.display = 'block';
                if (testBtn) testBtn.style.display = 'block';
                if (stopBtn) stopBtn.style.display = 'none';
                this.toggleButton.style.background = isDark ? 'linear-gradient(135deg, #333, #555)' : 'linear-gradient(135deg, #2196F3, #1976D2)';
                this.toggleButton.textContent = '🚀';
            }
        }
        
        getAvailableButtons() {
            const allButtons = Array.from(document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]'));
            return allButtons.filter(button => {
                if (button.offsetParent === null || button.style.display === 'none') return false;
                if (this.isFilteredOrganization(button)) return false;
                if (this.isAlreadyRespondedVacancy(button)) return false;
                return true;
            });
        }
        
        isAlreadyRespondedVacancy(button) {
            if (!this.settings.skipResponded) return false;
            
            const parent = button.closest('.vacancy-serp-item') || button.closest('.serp-item') || button.closest('[data-qa="vacancy-serp__vacancy"]');
            if (!parent) return false;
            
            const respondedElement = parent.querySelector('[data-qa="vacancy-serp__vacancy_responded"]');
            if (respondedElement) return true;
            
            const parentText = parent.innerText || parent.textContent || '';
            if (parentText.includes('Вы откликнулись') || parentText.includes('Вы уже откликнулись') || parentText.includes('Отклик отправлен')) return true;
            
            const buttonText = button.innerText || button.textContent || '';
            return !buttonText.includes('Откликнуться') && buttonText.trim() !== '';
        }
        
        async safeClick(button) {
            try {
                button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.wait(300);
                button.click();
                await this.wait(500);
                return true;
            } catch (error) {
                return false;
            }
        }
        
        async processSingleVacancy(button, index, total) {
            if (!this.isRunning) return false;
            
            this.resumeSelectedFlag = false;
            this.stats.total++;
            this.updateStatsDisplay();
            
            const orgName = this.getOrganizationName(button);
            this.updateStatus(`🎯 ${index + 1}/${total}: ${orgName || 'Обработка...'}`);
            
            const clicked = await this.safeClick(button);
            if (!clicked) {
                this.stats.failed++;
                this.updateStatsDisplay();
                this.updateStatus(`❌ ${index + 1}/${total}: не удалось нажать`);
                return false;
            }
            
            const success = await this.processResponse();
            
            if (success) {
                if (orgName && this.settings.autoRememberOrganizations) {
                    const added = this.addToAutoFilter(orgName);
                    if (added) {
                        this.updateStatus(`✅ ${index + 1}/${total}: отправлено! "${orgName}" добавлена в автофильтр`);
                    } else {
                        this.updateStatus(`✅ ${index + 1}/${total}: отправлено!`);
                    }
                } else {
                    this.updateStatus(`✅ ${index + 1}/${total}: отправлено!`);
                }
                this.stats.success++;
                this.updateStatsDisplay();
                await this.closeModal();
                return true;
            } else {
                this.stats.failed++;
                this.updateStatsDisplay();
                this.updateStatus(`⚠️ ${index + 1}/${total}: не удалось`);
                await this.closeModal();
                return false;
            }
        }
        
        async startAutoProcess() {
            if (this.isRunning) {
                this.updateStatus('⚠️ Процесс уже запущен');
                return;
            }
            
            this.isRunning = true;
            this.updateControlButtons();
            this.updateStatus('🚀 Запуск...');
            
            try {
                while (this.isRunning) {
                    const buttons = this.getAvailableButtons();
                    
                    if (buttons.length === 0) {
                        this.updateStatus('✅ Все доступные вакансии обработаны');
                        
                        if (this.settings.autoNextPage) {
                            const nextBtn = document.querySelector('[data-qa="pager-next"]');
                            if (nextBtn) {
                                this.updateStatus('➡️ Переход на след. страницу...');
                                nextBtn.click();
                                await this.wait(2000);
                                continue;
                            }
                        }
                        
                        this.updateStatus(`🎉 Завершено! Успешно: ${this.stats.success}, Ошибок: ${this.stats.failed}`);
                        break;
                    }
                    
                    this.updateStatus(`📊 Обработка ${buttons.length} вакансий...`);
                    
                    for (let i = 0; i < buttons.length && this.isRunning; i++) {
                        await this.processSingleVacancy(buttons[i], i, buttons.length);
                        if (i < buttons.length - 1 && this.isRunning) {
                            await this.wait(this.settings.delay * 1000);
                        }
                    }
                    await this.wait(800);
                }
            } catch (error) {
                console.error('Ошибка процесса:', error);
                this.updateStatus('❌ Ошибка');
            } finally {
                this.stopAutoProcess();
            }
        }
        
        stopAutoProcess() {
            this.isRunning = false;
            this.updateControlButtons();
            this.updateStatus('⏹️ Остановлено');
        }
        
        async testProcess() {
            const buttons = this.getAvailableButtons();
            if (buttons.length === 0) {
                this.updateStatus('❌ Нет вакансий для теста');
                return;
            }
            
            this.updateStatus('🧪 Тестируем...');
            this.isRunning = true;
            const success = await this.processSingleVacancy(buttons[0], 0, 1);
            this.isRunning = false;
            this.updateControlButtons();
            this.updateStatus(success ? '✅ Тест успешен!' : '⚠️ Тест не удался');
        }
        
        testFilter() {
            const buttons = document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]');
            let result = '🔍 Тест фильтра:\n\n';
            buttons.forEach((btn, i) => {
                const org = this.getOrganizationName(btn);
                const filtered = this.isFilteredOrganization(btn);
                result += `${i + 1}. ${org || '???'} - ${filtered ? '🚫 ФИЛЬТР' : '✅ НОРМА'}\n`;
            });
            this.updateStatus(result);
            console.log(result);
        }
        
        analyzePage() {
            const all = document.querySelectorAll('[data-qa="vacancy-serp__vacancy_response"]').length;
            const available = this.getAvailableButtons().length;
            this.updateStatus(`📊 Анализ:\nВсего: ${all}\nДоступно: ${available}\nУспешно: ${this.stats.success}\nОшибок: ${this.stats.failed}`);
        }
        
        clearHistory() {
            this.processedVacancies.clear();
            this.stats = { success: 0, failed: 0, skipped: 0, total: 0 };
            this.updateStatsDisplay();
            this.updateStatus('🗑️ Статистика очищена');
        }
    }
    
    function initialize() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(() => new HHAutoResponder(), 800));
        } else {
            setTimeout(() => new HHAutoResponder(), 800);
        }
    }
    
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'checkConnection') sendResponse({ connected: window.hhAutoResponder !== undefined });
        return true;
    });
    
    initialize();
    
})();