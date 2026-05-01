// ===== HH AUTO RESPONDER v2.0 — UI (2026 UNIFIED VIOLET THEME) =====
(function() {
    'use strict';

    if (!window.location.href.includes('hh.ru')) return;

    window.__HH_UI__ = {
        createPanel: function(bot) {
            const d = document.createElement('div');
            d.id = 'hh-auto-panel';

            const isDark = bot.theme === 'dark';
            
            // ===== 2026 UNIFIED VIOLET PALETTE =====
            const violet = '#a78bfa';
            const violetDark = '#7c3aed';
            const violetGlow = 'rgba(167,139,250,0.5)';
            const violetLight = '#c4b5fd';
            const bg = isDark ? 'rgba(20, 18, 35, 0.94)' : 'rgba(255, 255, 255, 0.92)';
            const tc = isDark ? '#e2e0f0' : '#333333';
            const bc = isDark ? 'rgba(167,139,250,0.4)' : 'rgba(124,58,237,0.3)';
            const sbg = isDark ? 'rgba(167,139,250,0.08)' : 'rgba(124,58,237,0.05)';
            const sc = isDark ? '#e2e0f0' : '#333333';
            const st = isDark ? '#9b8ec4' : '#777777';
            const ib = isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,58,237,0.2)';
            const ig = isDark ? 'rgba(167,139,250,0.06)' : 'rgba(124,58,237,0.03)';
            const W = window.__HH_WASM__;
            
            // 2026 Toggle Colors
            const toggleGlow = isDark ? 'rgba(167,139,250,0.6)' : 'rgba(245,158,11,0.6)';

            Object.assign(d.style, {
                position:'fixed', top:'120px', right:'20px', zIndex:'10000',
                background: bg,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: tc, 
                border: `2px solid ${bc}`,
                borderRadius:'16px', padding:'20px', width:'390px', minWidth:'390px', maxWidth:'390px',
                boxShadow: isDark 
                    ? `0 8px 40px rgba(0,0,0,0.5), 0 0 60px ${violetGlow}20, 0 0 1px rgba(255,255,255,0.1)` 
                    : `0 8px 32px rgba(0,0,0,0.08), 0 0 40px rgba(124,58,237,0.05), 0 0 1px rgba(0,0,0,0.05)`,
                fontFamily: 'Arial, sans-serif',
                maxHeight:'80vh', overflowY:'auto', overflowX:'hidden',
                transition:'none', boxSizing:'border-box', resize:'none'
            });

            const ar = bot.settingsCollapsed ? '▶' : '▼';

            d.innerHTML = `
                <style>
                    #hh-auto-panel::-webkit-scrollbar { width: 4px; height: 4px; }
                    #hh-auto-panel::-webkit-scrollbar-track { background: transparent; border-radius: 2px; }
                    #hh-auto-panel::-webkit-scrollbar-thumb { background: ${isDark ? 'rgba(167,139,250,0.3)' : 'rgba(124,58,237,0.2)'}; border-radius: 4px; min-height: 20px; max-height: 40px; }
                    #hh-auto-panel::-webkit-scrollbar-thumb:hover { background: ${isDark ? 'rgba(167,139,250,0.5)' : 'rgba(124,58,237,0.35)'}; }
                    
                    .hh-btn {
                        border: none; cursor: pointer; font-weight: 600; font-size: 13px;
                        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); outline: none;
                        position: relative; overflow: hidden;
                    }
                    .hh-btn::after {
                        content: ''; position: absolute; inset: 0;
                        background: linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%);
                        opacity: 0; transition: opacity 0.3s;
                    }
                    .hh-btn:hover::after { opacity: 1; }
                    .hh-btn:active { transform: scale(0.96); }
                    
                    .hh-btn-start {
                        width: 100%; padding: 14px; color: white; border-radius: 12px;
                        background: linear-gradient(135deg, #7c3aed, #a78bfa);
                        box-shadow: 0 4px 20px ${violetGlow}40, 0 0 30px ${violetGlow}15;
                        font-size: 14px; letter-spacing: 0.5px;
                    }
                    .hh-btn-start:hover {
                        box-shadow: 0 8px 30px ${violetGlow}60, 0 0 50px ${violetGlow}25;
                        transform: translateY(-2px);
                    }
                    
                    .hh-btn-test {
                        width: 100%; padding: 12px; color: ${violet}; border-radius: 12px;
                        background: transparent;
                        border: 2px solid ${isDark ? 'rgba(167,139,250,0.35)' : 'rgba(124,58,237,0.3)'};
                        box-shadow: 0 0 15px ${violetGlow}10;
                    }
                    .hh-btn-test:hover {
                        background: ${isDark ? 'rgba(167,139,250,0.1)' : 'rgba(124,58,237,0.06)'};
                        border-color: ${violet};
                        box-shadow: 0 0 25px ${violetGlow}25;
                        transform: translateY(-2px);
                    }
                    
                    .hh-btn-stop {
                        width: 100%; padding: 14px; color: white; border-radius: 12px;
                        background: linear-gradient(135deg, #ef4444, #f87171);
                        box-shadow: 0 4px 20px rgba(239,68,68,0.35), 0 0 30px rgba(239,68,68,0.1);
                        font-size: 14px; letter-spacing: 0.5px;
                    }
                    .hh-btn-stop:hover {
                        box-shadow: 0 8px 30px rgba(239,68,68,0.55), 0 0 50px rgba(239,68,68,0.2);
                        transform: translateY(-2px);
                    }
                    
                    .hh-btn-action {
                        flex: 1; padding: 10px 6px; border-radius: 10px;
                        font-size: 12px; color: ${isDark ? '#e2e0f0' : '#555'};
                        background: ${isDark ? 'rgba(167,139,250,0.1)' : 'rgba(124,58,237,0.05)'};
                        border: 1px solid ${isDark ? 'rgba(167,139,250,0.2)' : 'rgba(124,58,237,0.15)'};
                        box-shadow: 0 0 10px ${violetGlow}05;
                    }
                    .hh-btn-action:hover {
                        background: ${isDark ? 'rgba(167,139,250,0.18)' : 'rgba(124,58,237,0.1)'};
                        border-color: ${violet};
                        box-shadow: 0 0 20px ${violetGlow}20;
                        transform: translateY(-1px);
                        color: ${isDark ? '#fff' : '#333'};
                    }
                    
                    /* ===== 2026 COMPACT THEME TOGGLE ===== */
                    @keyframes floatStars {
                        0%, 100% { transform: translateY(0) scale(1); opacity: 0; }
                        50% { transform: translateY(-6px) scale(0.6); opacity: 1; }
                    }
                    
                    .toggle-2026 {
                        position: relative; width: 56px; height: 28px; 
                        cursor: pointer; flex-shrink: 0;
                    }
                    
                    .toggle-2026-track {
                        position: absolute; inset: 0;
                        background: ${isDark ? '#141223' : '#f0f0f5'};
                        border-radius: 14px;
                        border: 2px solid ${isDark ? 'rgba(167,139,250,0.35)' : 'rgba(245,158,11,0.35)'};
                        transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                        overflow: hidden;
                    }
                    
                    .toggle-2026-track::before {
                        content: '';
                        position: absolute; inset: 0;
                        background: ${isDark 
                            ? 'radial-gradient(circle at 30% 50%, rgba(167,139,250,0.2) 0%, transparent 60%), radial-gradient(circle at 70% 50%, rgba(245,158,11,0.08) 0%, transparent 60%)'
                            : 'radial-gradient(circle at 30% 50%, rgba(167,139,250,0.05) 0%, transparent 60%), radial-gradient(circle at 70% 50%, rgba(245,158,11,0.2) 0%, transparent 60%)'};
                        transition: all 0.5s;
                    }
                    
                    .toggle-2026-stars {
                        position: absolute; inset: 0; pointer-events: none;
                    }
                    
                    .toggle-2026-star {
                        position: absolute; width: 2px; height: 2px;
                        background: white; border-radius: 50%;
                        animation: floatStars 3s ease-in-out infinite;
                    }
                    
                    .toggle-2026-thumb {
                        position: absolute; top: 2px; 
                        left: ${isDark ? '30px' : '2px'};
                        width: 20px; height: 20px;
                        border-radius: 50%;
                        background: ${isDark 
                            ? 'linear-gradient(135deg, #c4b5fd, #a78bfa)'
                            : 'linear-gradient(135deg, #fbbf24, #f59e0b)'};
                        box-shadow: ${isDark 
                            ? '0 2px 12px rgba(167,139,250,0.6), 0 0 20px rgba(167,139,250,0.35), inset 0 1px 0 rgba(255,255,255,0.3)'
                            : '0 2px 12px rgba(245,158,11,0.6), 0 0 20px rgba(245,158,11,0.35), inset 0 1px 0 rgba(255,255,255,0.3)'};
                        transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
                        z-index: 2;
                    }
                    
                    .toggle-2026-thumb::after {
                        content: '';
                        position: absolute; top: 3px; left: 5px;
                        width: 6px; height: 6px;
                        background: rgba(255,255,255,0.5);
                        border-radius: 50%;
                        transition: all 0.5s;
                    }
                    
                    .toggle-2026-icon {
                        position: absolute; top: 50%; transform: translateY(-50%);
                        font-size: 11px; z-index: 1; pointer-events: none;
                        transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    
                    .toggle-2026-sun {
                        left: 6px;
                        opacity: ${isDark ? '0.3' : '1'};
                        transform: translateY(-50%) ${isDark ? 'scale(0.8)' : 'scale(1.15)'};
                        filter: ${isDark ? 'grayscale(0.5)' : 'drop-shadow(0 0 4px rgba(245,158,11,0.8))'};
                    }
                    
                    .toggle-2026-moon {
                        right: 6px;
                        opacity: ${isDark ? '1' : '0.3'};
                        transform: translateY(-50%) ${isDark ? 'scale(1.15)' : 'scale(0.8)'};
                        filter: ${isDark ? 'drop-shadow(0 0 4px rgba(167,139,250,0.8))' : 'grayscale(0.5)'};
                    }
                    
                    .toggle-2026:hover .toggle-2026-thumb {
                        box-shadow: ${isDark 
                            ? '0 4px 18px rgba(167,139,250,0.8), 0 0 30px rgba(167,139,250,0.5), inset 0 1px 0 rgba(255,255,255,0.4)'
                            : '0 4px 18px rgba(245,158,11,0.8), 0 0 30px rgba(245,158,11,0.5), inset 0 1px 0 rgba(255,255,255,0.4)'};
                    }
                    
                    .toggle-2026:hover .toggle-2026-track {
                        border-color: ${isDark ? 'rgba(167,139,250,0.6)' : 'rgba(245,158,11,0.6)'};
                    }
                    
                    .toggle-2026:active .toggle-2026-thumb {
                        width: 24px;
                        border-radius: 11px;
                    }
                </style>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:nowrap;">
                    <h3 style="margin:0;color:${isDark ? violet : violetDark};font-size:16px;white-space:nowrap;flex-shrink:0;min-width:fit-content;">HH Авто-отклик v2.0 ${W?'🛡️':''}</h3>
                    <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
                        <span style="font-size:10px;color:${violet};background:${isDark?'rgba(167,139,250,0.15)':'rgba(124,58,237,0.08)'};padding:3px 8px;border-radius:8px;font-weight:600;">${W?'WASM':'JS'}</span>
                        
                        <div id="hh-theme-slider" class="toggle-2026">
                            <div class="toggle-2026-track">
                                <div class="toggle-2026-stars">
                                    ${[...Array(4)].map((_,i) => `<div class="toggle-2026-star" style="top:${20+Math.random()*60}%;left:${10+Math.random()*80}%;animation-delay:${i*0.7}s;opacity:${isDark?0.7:0};"></div>`).join('')}
                                </div>
                            </div>
                            <div class="toggle-2026-thumb"></div>
                            <span class="toggle-2026-icon toggle-2026-sun">☀️</span>
                            <span class="toggle-2026-icon toggle-2026-moon">🌙</span>
                        </div>
                        
                        <button id="hh-close-btn" style="background:none;border:none;font-size:20px;cursor:pointer;color:${st};padding:0;">×</button>
                    </div>
                </div>
                <div id="hh-status" style="background:${sbg};color:${sc};padding:10px;border-radius:8px;font-size:13px;min-height:50px;margin-bottom:12px;border:1px solid ${ib};white-space:pre-line;overflow-x:hidden;word-break:break-word;max-width:100%;box-sizing:border-box;">✅ Готов к работе</div>
                <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
                    <span style="font-size:12px;color:${st};">🔍 Найдено: <b id="hh-count" style="color:${violet};">0</b></span>
                    <span id="hh-stats" style="font-size:11px;color:${st};background:${sbg};padding:4px 8px;border-radius:6px;border:1px solid ${ib};">✅0 ❌0 ⏭️0</span>
                </div>
                <div style="margin-bottom:12px;">
                    <div style="font-weight:bold;font-size:13px;margin-bottom:5px;color:${tc};display:flex;justify-content:space-between;align-items:center;">
                        <span>📝 Сопроводительное письмо:</span>
                        <label style="display:flex;align-items:center;gap:5px;font-weight:normal;font-size:12px;cursor:pointer;">
                            <input type="checkbox" id="hh-skip-cover-letter" ${bot.settings.skipCoverLetter?'checked':''} style="cursor:pointer;accent-color:${violet};">
                            <span style="color:${bot.settings.skipCoverLetter?violet:st};">🚫 Не отправлять</span>
                        </label>
                    </div>
                    <textarea id="hh-letter" style="width:100%;height:100px;padding:8px;border:1px solid ${ib};border-radius:8px;font-size:13px;resize:vertical;background:${ig};color:${tc};box-sizing:border-box;${bot.settings.skipCoverLetter?'opacity:0.5;pointer-events:none;':''}">${bot.coverLetter}</textarea>
                    <div style="font-size:11px;color:${st};margin-top:3px;display:flex;justify-content:space-between;"><span>* Укажите своё настоящее имя</span><span id="hh-char-count">${bot.coverLetter.length}/2000</span></div>
                </div>
                <div style="margin-bottom:12px;">
                    <div id="hh-settings-header" style="font-weight:bold;font-size:13px;margin:10px 0 5px 0;color:${tc};cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none;">
                        <span id="hh-settings-arrow" style="font-size:14px;width:16px;text-align:center;color:${violet};">${ar}</span><span>⚙️ Настройки</span>
                    </div>
                    <div id="hh-settings-content" style="margin-left:20px;${bot.settingsCollapsed?'display:none;':''}">
                        <label style="display:flex;align-items:center;font-size:13px;margin-bottom:5px;color:${tc};cursor:pointer;"><input type="checkbox" id="hh-auto-next" ${bot.settings.autoNextPage?'checked':''} style="margin-right:8px;accent-color:${violet};">Автопереход на следующую страницу</label>
                        <label style="display:flex;align-items:center;font-size:13px;margin-bottom:5px;color:${tc};cursor:pointer;"><input type="checkbox" id="hh-skip-responded" ${bot.settings.skipResponded?'checked':''} style="margin-right:8px;accent-color:${violet};">Пропускать уже откликнутые</label>
                        <label style="display:flex;align-items:center;font-size:13px;margin-bottom:5px;color:${tc};cursor:pointer;"><input type="checkbox" id="hh-filter-organizations" ${bot.settings.filterOrganizations?'checked':''} style="margin-right:8px;accent-color:${violet};">Фильтровать организации</label>
                        <label style="display:flex;align-items:center;font-size:13px;margin-bottom:5px;color:${tc};cursor:pointer;"><input type="checkbox" id="hh-auto-remember" ${bot.settings.autoRememberOrganizations?'checked':''} style="margin-right:8px;accent-color:${violet};"><strong>Автодобавление в фильтр</strong></label>
                        <label style="display:flex;align-items:center;font-size:13px;margin-bottom:5px;color:${tc};cursor:pointer;"><input type="checkbox" id="hh-auto-select-resume" ${bot.settings.autoSelectResume?'checked':''} style="margin-right:8px;accent-color:${violet};"><strong>🎯 Автовыбор резюме</strong></label>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;color:${tc};"><span style="font-size:12px;">Порог совпадения:</span><input type="range" id="hh-resume-matching" min="0" max="100" step="5" value="${bot.settings.resumeTitleMatching}" style="width:100px;accent-color:${violet};"><span id="hh-matching-value" style="color:${violet};font-weight:600;">${bot.settings.resumeTitleMatching}%</span></div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;color:${tc};"><span style="font-size:13px;">Задержка (сек):</span><input type="number" id="hh-delay" min="0.3" max="5" step="0.1" value="${bot.settings.delay}" style="width:50px;padding:4px;border:1px solid ${ib};border-radius:6px;background:${ig};color:${tc};text-align:center;"></div>
                    </div>
                </div>
                <div style="margin-bottom:12px;">
                    <div style="font-weight:bold;font-size:13px;margin-bottom:5px;color:${tc};">🚫 Фильтр организаций (ручной):</div>
                    <textarea id="hh-filter-text" placeholder="Введите названия организаций через запятую&#10;Пример: Яндекс, Google" style="width:100%;height:80px;padding:8px;border:1px solid ${ib};border-radius:8px;font-size:13px;resize:vertical;background:${ig};color:${tc};box-sizing:border-box;">${bot.filteredOrganizations.join(', ')}</textarea>
                    <div style="font-size:11px;color:${st};margin-top:3px;">* Не откликаться на эти организации (полное или частичное совпадение)</div>
                </div>
                <div style="display:flex;flex-direction:column;gap:10px;margin:15px 0 10px;">
                    <button id="hh-start" class="hh-btn hh-btn-start">▶️ НАЧАТЬ АВТО-ОТКЛИК</button>
                    <button id="hh-test" class="hh-btn hh-btn-test">🧪 Тест на 1 вакансию</button>
                    <button id="hh-stop" class="hh-btn hh-btn-stop" style="display:none;">⏹️ ОСТАНОВИТЬ</button>
                </div>
                <div style="display:flex;gap:8px;margin-bottom:10px;">
                    <button id="hh-analyze" class="hh-btn hh-btn-action">📊 Анализ</button>
                    <button id="hh-test-filter" class="hh-btn hh-btn-action">🔍 Тест фильтра</button>
                    <button id="hh-show-auto-filter" class="hh-btn hh-btn-action">🤖 Автофильтр</button>
                </div>
                <div style="display:flex;gap:8px;margin-bottom:10px;">
                    <button id="hh-clear" class="hh-btn hh-btn-action">🗑️ Очистить</button>
                    <button id="hh-clear-auto-filter" class="hh-btn hh-btn-action" style="color:${isDark?'#f87171':'#ef4444'};">🧹 Автофильтр</button>
                </div>
                <div style="text-align:center;font-size:10px;color:${st};border-top:1px solid ${ib};padding-top:10px;margin-top:15px;">By ALEX 🛡️ Tech Guard | WASM ${W?'✅':'⚠️'} | v2.0</div>
            `;
            return d;
        },

        createToggleButton: function(bot) {
            const tb = document.createElement('button');
            tb.id = 'hh-toggle-btn';
            tb.innerHTML = '🚀';
            const isDark = bot.theme === 'dark';
            const violet = '#a78bfa';
            const violetGlow = 'rgba(167,139,250,0.5)';
            
            Object.assign(tb.style, {
                position:'fixed', top:'60px', right:'20px', zIndex:'9999',
                background: isDark 
                    ? 'linear-gradient(135deg, #7c3aed, #a78bfa)' 
                    : 'linear-gradient(135deg, #a78bfa, #c4b5fd)',
                color:'white', border:'none', borderRadius:'14px', width:'50px', height:'50px',
                fontSize:'24px', cursor:'pointer', 
                boxShadow: isDark 
                    ? `0 4px 20px ${violetGlow}50, 0 0 30px ${violetGlow}20` 
                    : `0 4px 16px ${violetGlow}30, 0 0 20px ${violetGlow}10`,
                display:'flex', alignItems:'center', justifyContent:'center',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
            });
            tb.addEventListener('mouseenter', () => { 
                tb.style.transform = 'scale(1.08)'; 
                tb.style.boxShadow = isDark 
                    ? `0 8px 30px ${violetGlow}70, 0 0 50px ${violetGlow}35` 
                    : `0 6px 24px ${violetGlow}50, 0 0 35px ${violetGlow}20`;
            });
            tb.addEventListener('mouseleave', () => { 
                tb.style.transform = 'scale(1)'; 
                tb.style.boxShadow = isDark 
                    ? `0 4px 20px ${violetGlow}50, 0 0 30px ${violetGlow}20` 
                    : `0 4px 16px ${violetGlow}30, 0 0 20px ${violetGlow}10`;
            });
            return tb;
        }
    };

    console.log('=== UI: Interface ready ===');
})();