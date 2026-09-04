// ===== HH AUTO RESPONDER v2.4 — UI (красивые звёзды) =====
(function() {
    'use strict';

    const _hn = window.location.hostname;
    if (_hn !== 'hh.ru' && !_hn.endsWith('.hh.ru')) return;
    if (window.__HH_UI__?._initialized) return;

    function escapeHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function safeNum(val, fallback) { const n = Number(val); return isNaN(n) ? fallback : n; }

    window.__HH_UI__ = {
        _initialized: true,
        _toggleListeners: null,

        createPanel: function(bot) {
            // FIX: старая панель удаляется ПОСЛЕ создания новой — при исключении в середине
            // пользователь не терял бы UI полностью. Сохраняем ссылку, удаляем в конце.
            const oldPanel = document.getElementById('hh-auto-panel');

            const d = document.createElement('div');
            d.id = 'hh-auto-panel';

            const isDark = bot.theme === 'dark';
            const W = window.__HH_WASM__;
            
            const violet = '#a78bfa';
            const violetDark = '#7c3aed';
            const bg = isDark ? 'rgba(20, 18, 35, 0.94)' : 'rgba(255, 255, 255, 0.92)';
            const tc = isDark ? '#e2e0f0' : '#333333';
            const bc = isDark ? 'rgba(167,139,250,0.4)' : 'rgba(124,58,237,0.3)';
            const sbg = isDark ? 'rgba(167,139,250,0.08)' : 'rgba(124,58,237,0.05)';
            const sc = isDark ? '#e2e0f0' : '#333333';
            const st = isDark ? '#9b8ec4' : '#777777';
            const ib = isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,58,237,0.2)';
            const ig = isDark ? 'rgba(167,139,250,0.06)' : 'rgba(124,58,237,0.03)';

            Object.assign(d.style, {
                position:'fixed', top:'120px', right:'20px', zIndex:'10000',
                background: bg,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: tc, 
                border: `2px solid ${bc}`,
                borderRadius:'16px', padding:'20px',
                width: 'min(390px, calc(100vw - 40px))',
                minWidth: '320px',
                maxWidth: '390px',
                boxShadow: isDark 
                    ? `0 8px 40px rgba(0,0,0,0.5), 0 0 60px rgba(167,139,250,0.13), 0 0 1px rgba(255,255,255,0.1)` 
                    : `0 8px 32px rgba(0,0,0,0.08), 0 0 40px rgba(124,58,237,0.05), 0 0 1px rgba(0,0,0,0.05)`,
                fontFamily: 'Arial, sans-serif',
                maxHeight:'80vh', overflowY:'auto', overflowX:'hidden',
                boxSizing:'border-box', resize:'none'
            });

            const ar = bot.settingsCollapsed ? '\u25B6' : '\u25BC';
            const botVersion = bot.version || '2.4';
            const safeCoverLetterLength = (bot.coverLetter || '').length;
            const safeMatching = safeNum(bot.settings.resumeTitleMatching, 70);
            const safeDelay = safeNum(bot.settings.delay, 1.5);

            // Звёзды: 7 штук с разным размером, позицией и скоростью мерцания
            let starsHTML = '';
            const starSeeds = [0.12, 0.37, 0.54, 0.71, 0.83, 0.28, 0.65];
            for (let i = 0; i < 7; i++) {
                const seed = starSeeds[i];
                if (typeof seed !== 'number' || isNaN(seed)) continue;
                const size = 1.2 + seed * 2.2;
                const x = 4 + (i * 7.2) + (seed * 6 - 3);
                const y = 3 + seed * 21;
                const dur = 1.6 + seed * 2.8;
                const delay = seed * 2.4;
                const maxOp = 0.45 + seed * 0.55;
                starsHTML += '<div class="hhext-toggle-star" style="' +
                    'top:' + y.toFixed(1) + 'px;' +
                    'left:' + x.toFixed(1) + 'px;' +
                    'width:' + size.toFixed(1) + 'px;' +
                    'height:' + size.toFixed(1) + 'px;' +
                    'animation-duration:' + dur.toFixed(2) + 's;' +
                    'animation-delay:' + delay.toFixed(2) + 's;' +
                    '--max-opacity:' + maxOp.toFixed(2) + ';' +
                    'opacity:' + (isDark ? maxOp.toFixed(2) : '0') + ';' +
                    '"></div>';
            }

            d.innerHTML = 
                '<style>' +
                    '#hh-auto-panel::-webkit-scrollbar { width: 4px; height: 4px; }' +
                    '#hh-auto-panel::-webkit-scrollbar-track { background: transparent; border-radius: 2px; }' +
                    '#hh-auto-panel::-webkit-scrollbar-thumb { background: ' + (isDark ? 'rgba(167,139,250,0.3)' : 'rgba(124,58,237,0.2)') + '; border-radius: 4px; min-height: 20px; max-height: 40px; }' +
                    '#hh-auto-panel::-webkit-scrollbar-thumb:hover { background: ' + (isDark ? 'rgba(167,139,250,0.5)' : 'rgba(124,58,237,0.35)') + '; }' +
                    '.hh-toggle-btn:hover { transform: scale(1.08) !important; }' +
                    '.hh-toggle-btn { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important; }' +
                    '.hh-toggle-btn.hh-toggle-running { background: linear-gradient(135deg, #ef4444, #f87171) !important; }' +
                    '.hh-toggle-btn.hh-toggle-stopped { background: linear-gradient(135deg, #7c3aed, #a78bfa) !important; }' +
                    '.hhext-btn { border: none; cursor: pointer; font-weight: 600; font-size: 13px; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); outline: none; position: relative; overflow: hidden; }' +
                    '.hhext-btn::after { content: ""; position: absolute; inset: 0; background: linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%); opacity: 0; transition: opacity 0.3s; }' +
                    '.hhext-btn:hover::after { opacity: 1; }' +
                    '.hhext-btn:active { transform: scale(0.96); }' +
                    '.hhext-btn-start { width: 100%; padding: 14px; color: white; border-radius: 12px; background: linear-gradient(135deg, #7c3aed, #a78bfa); box-shadow: 0 4px 20px rgba(167,139,250,0.25), 0 0 30px rgba(167,139,250,0.08); font-size: 14px; letter-spacing: 0.5px; }' +
                    '.hhext-btn-start:hover { box-shadow: 0 8px 30px rgba(167,139,250,0.38), 0 0 50px rgba(167,139,250,0.15); transform: translateY(-2px); }' +
                    '.hhext-btn-test { width: 100%; padding: 12px; color: ' + violet + '; border-radius: 12px; background: transparent; border: 2px solid ' + (isDark ? 'rgba(167,139,250,0.35)' : 'rgba(124,58,237,0.3)') + '; box-shadow: 0 0 15px rgba(167,139,250,0.06); }' +
                    '.hhext-btn-test:hover { background: ' + (isDark ? 'rgba(167,139,250,0.1)' : 'rgba(124,58,237,0.06)') + '; border-color: ' + violet + '; box-shadow: 0 0 25px rgba(167,139,250,0.15); transform: translateY(-2px); }' +
                    '.hhext-btn-stop { width: 100%; padding: 14px; color: white; border-radius: 12px; background: linear-gradient(135deg, #ef4444, #f87171); box-shadow: 0 4px 20px rgba(239,68,68,0.35), 0 0 30px rgba(239,68,68,0.1); font-size: 14px; letter-spacing: 0.5px; }' +
                    '.hhext-btn-stop:hover { box-shadow: 0 8px 30px rgba(239,68,68,0.55), 0 0 50px rgba(239,68,68,0.2); transform: translateY(-2px); }' +
                    '.hhext-btn-action { flex: 1; padding: 10px 6px; border-radius: 10px; font-size: 12px; color: ' + (isDark ? '#e2e0f0' : '#555') + '; background: ' + (isDark ? 'rgba(167,139,250,0.1)' : 'rgba(124,58,237,0.05)') + '; border: 1px solid ' + (isDark ? 'rgba(167,139,250,0.2)' : 'rgba(124,58,237,0.15)') + '; box-shadow: 0 0 10px rgba(167,139,250,0.02); }' +
                    '.hhext-btn-action:hover { background: ' + (isDark ? 'rgba(167,139,250,0.18)' : 'rgba(124,58,237,0.1)') + '; border-color: ' + violet + '; box-shadow: 0 0 20px rgba(167,139,250,0.13); transform: translateY(-1px); color: ' + (isDark ? '#fff' : '#333') + '; }' +
                    '@keyframes floatStars { 0%, 100% { transform: translateY(0) scale(0.3); opacity: 0.04; } 35% { opacity: var(--max-opacity, 0.8); } 50% { transform: translateY(-7px) scale(1.25); opacity: var(--max-opacity, 1); } 65% { opacity: 0.08; } }' +
                    '.hhext-toggle-star { position: absolute; background: white; border-radius: 50%; box-shadow: 0 0 2px rgba(255,255,255,0.95), 0 0 5px rgba(180,200,255,0.55), 0 0 9px rgba(167,139,250,0.25); animation: floatStars 3s ease-in-out infinite; pointer-events: none; }' +
                    '.hhext-toggle { position: relative; width: 56px; height: 28px; cursor: pointer; flex-shrink: 0; }' +
                    '.hhext-toggle-track { position: absolute; inset: 0; background: ' + (isDark ? '#141223' : '#f0f0f5') + '; border-radius: 14px; border: 2px solid ' + (isDark ? 'rgba(167,139,250,0.35)' : 'rgba(245,158,11,0.35)') + '; transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; }' +
                    '.hhext-toggle-track::before { content: ""; position: absolute; inset: 0; background: ' + (isDark ? 'radial-gradient(circle at 30% 50%, rgba(167,139,250,0.2) 0%, transparent 60%), radial-gradient(circle at 70% 50%, rgba(245,158,11,0.08) 0%, transparent 60%)' : 'radial-gradient(circle at 30% 50%, rgba(167,139,250,0.05) 0%, transparent 60%), radial-gradient(circle at 70% 50%, rgba(245,158,11,0.2) 0%, transparent 60%)') + '; transition: all 0.5s; }' +
                    '.hhext-toggle-stars { position: absolute; inset: 0; pointer-events: none; }' +
                    '.hhext-toggle-thumb { position: absolute; top: 2px; left: ' + (isDark ? '30px' : '2px') + '; width: 20px; height: 20px; border-radius: 50%; background: ' + (isDark ? 'linear-gradient(135deg, #c4b5fd, #a78bfa)' : 'linear-gradient(135deg, #fbbf24, #f59e0b)') + '; box-shadow: ' + (isDark ? '0 2px 12px rgba(167,139,250,0.6), 0 0 20px rgba(167,139,250,0.35), inset 0 1px 0 rgba(255,255,255,0.3)' : '0 2px 12px rgba(245,158,11,0.6), 0 0 20px rgba(245,158,11,0.35), inset 0 1px 0 rgba(255,255,255,0.3)') + '; transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); z-index: 2; }' +
                    '.hhext-toggle-thumb::after { content: ""; position: absolute; top: 3px; left: 5px; width: 6px; height: 6px; background: rgba(255,255,255,0.5); border-radius: 50%; transition: all 0.5s; }' +
                    '.hhext-toggle-icon { position: absolute; top: 50%; transform: translateY(-50%); font-size: 11px; z-index: 1; pointer-events: none; transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1); }' +
                    '.hhext-toggle-sun { left: 6px; opacity: ' + (isDark ? '0.3' : '1') + '; transform: translateY(-50%) ' + (isDark ? 'scale(0.8)' : 'scale(1.15)') + '; filter: ' + (isDark ? 'grayscale(0.5)' : 'drop-shadow(0 0 4px rgba(245,158,11,0.8))') + '; }' +
                    '.hhext-toggle-moon { right: 6px; opacity: ' + (isDark ? '1' : '0.3') + '; transform: translateY(-50%) ' + (isDark ? 'scale(1.15)' : 'scale(0.8)') + '; filter: ' + (isDark ? 'drop-shadow(0 0 4px rgba(167,139,250,0.8))' : 'grayscale(0.5)') + '; }' +
                    '.hhext-toggle:hover .hhext-toggle-thumb { box-shadow: ' + (isDark ? '0 4px 18px rgba(167,139,250,0.8), 0 0 30px rgba(167,139,250,0.5), inset 0 1px 0 rgba(255,255,255,0.4)' : '0 4px 18px rgba(245,158,11,0.8), 0 0 30px rgba(245,158,11,0.5), inset 0 1px 0 rgba(255,255,255,0.4)') + '; }' +
                    '.hhext-toggle:hover .hhext-toggle-track { border-color: ' + (isDark ? 'rgba(167,139,250,0.6)' : 'rgba(245,158,11,0.6)') + '; }' +
                    '.hhext-toggle:active .hhext-toggle-thumb { width: 24px; border-radius: 11px; }' +
                '</style>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:nowrap;">' +
                    '<h3 style="margin:0;color:' + (isDark ? violet : violetDark) + ';font-size:16px;white-space:nowrap;flex-shrink:0;min-width:fit-content;">HH Авто-отклик v' + escapeHtml(botVersion) + ' ' + (W ? '\uD83D\uDEE1\uFE0F' : '') + '</h3>' +
                    '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">' +
                        '<span style="font-size:10px;color:' + violet + ';background:' + (isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,58,237,0.08)') + ';padding:3px 8px;border-radius:8px;font-weight:600;">' + (W ? 'WASM' : 'JS') + '</span>' +
                        '<div id="hh-theme-slider" class="hhext-toggle">' +
                            '<div class="hhext-toggle-track">' +
                                '<div class="hhext-toggle-stars">' +
                                    starsHTML +
                                '</div>' +
                            '</div>' +
                            '<div class="hhext-toggle-thumb"></div>' +
                            '<span class="hhext-toggle-icon hhext-toggle-sun">\u2600\uFE0F</span>' +
                            '<span class="hhext-toggle-icon hhext-toggle-moon">\uD83C\uDF19</span>' +
                        '</div>' +
                        '<button id="hh-close-btn" style="background:none;border:none;font-size:20px;cursor:pointer;color:' + st + ';padding:0;">\u00D7</button>' +
                    '</div>' +
                '</div>' +
                '<div id="hh-status" style="background:' + sbg + ';color:' + sc + ';padding:10px;border-radius:8px;font-size:13px;min-height:50px;margin-bottom:12px;border:1px solid ' + ib + ';white-space:pre-line;overflow-x:hidden;word-break:break-word;max-width:100%;box-sizing:border-box;">\u2705 Готов к работе</div>' +
                '<div style="display:flex;justify-content:space-between;margin-bottom:12px;">' +
                    '<span style="font-size:12px;color:' + st + ';">\uD83D\uDD0D Найдено: <b id="hh-count" style="color:' + violet + ';">0</b></span>' +
                    '<span id="hh-stats" style="font-size:11px;color:' + st + ';background:' + sbg + ';padding:4px 8px;border-radius:6px;border:1px solid ' + ib + ';">\u27050 \u274C0 \u23ED\uFE0F0</span>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<div style="font-weight:bold;font-size:13px;margin-bottom:5px;color:' + tc + ';display:flex;justify-content:space-between;align-items:center;">' +
                        '<span>\uD83D\uDCDD Сопроводительное письмо:</span>' +
                        '<label style="display:flex;align-items:center;gap:5px;font-weight:normal;font-size:12px;cursor:pointer;">' +
                            '<input type="checkbox" id="hh-skip-cover-letter" ' + (bot.settings.skipCoverLetter ? 'checked' : '') + ' style="cursor:pointer;accent-color:' + violet + ';">' +
                            '<span style="color:' + (bot.settings.skipCoverLetter ? violet : st) + ';">\uD83D\uDEAB Не отправлять</span>' +
                        '</label>' +
                    '</div>' +
                    '<textarea id="hh-letter" maxlength="2000" style="width:100%;height:100px;padding:8px;border:1px solid ' + ib + ';border-radius:8px;font-size:13px;resize:vertical;background:' + ig + ';color:' + tc + ';box-sizing:border-box;' + (bot.settings.skipCoverLetter ? 'opacity:0.5;pointer-events:none;' : '') + '"></textarea>' +
                    '<div style="font-size:11px;color:' + st + ';margin-top:3px;display:flex;justify-content:space-between;gap:8px;"><span>* Своё имя. Подстановки: {вакансия}, {компания}</span><span id="hh-char-count">' + safeCoverLetterLength + '/2000</span></div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<div id="hh-settings-header" style="font-weight:bold;font-size:13px;margin:10px 0 5px 0;color:' + tc + ';cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none;">' +
                        '<span id="hh-settings-arrow" style="font-size:14px;width:16px;text-align:center;color:' + violet + ';">' + ar + '</span><span>\u2699\uFE0F Настройки</span>' +
                    '</div>' +
                    '<div id="hh-settings-content" style="margin-left:20px;' + (bot.settingsCollapsed ? 'display:none;' : '') + '">' +
                        '<label style="display:flex;align-items:center;font-size:13px;margin-bottom:5px;color:' + tc + ';cursor:pointer;"><input type="checkbox" id="hh-auto-next" ' + (bot.settings.autoNextPage ? 'checked' : '') + ' style="margin-right:8px;accent-color:' + violet + ';">Автопереход на следующую страницу</label>' +
                        '<label style="display:flex;align-items:center;font-size:13px;margin-bottom:5px;color:' + tc + ';cursor:pointer;"><input type="checkbox" id="hh-skip-responded" ' + (bot.settings.skipResponded ? 'checked' : '') + ' style="margin-right:8px;accent-color:' + violet + ';">Пропускать уже откликнутые</label>' +
                        '<label style="display:flex;align-items:center;font-size:13px;margin-bottom:5px;color:' + tc + ';cursor:pointer;"><input type="checkbox" id="hh-filter-organizations" ' + (bot.settings.filterOrganizations ? 'checked' : '') + ' style="margin-right:8px;accent-color:' + violet + ';">Фильтровать организации</label>' +
                        '<label style="display:flex;align-items:center;font-size:13px;margin-bottom:5px;color:' + tc + ';cursor:pointer;"><input type="checkbox" id="hh-auto-remember" ' + (bot.settings.autoRememberOrganizations ? 'checked' : '') + ' style="margin-right:8px;accent-color:' + violet + ';"><strong>Автодобавление в фильтр</strong></label>' +
                        '<label style="display:flex;align-items:center;font-size:13px;margin-bottom:5px;color:' + tc + ';cursor:pointer;"><input type="checkbox" id="hh-auto-select-resume" ' + (bot.settings.autoSelectResume ? 'checked' : '') + ' style="margin-right:8px;accent-color:' + violet + ';"><strong>\uD83C\uDFAF Автовыбор резюме</strong></label>' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;color:' + tc + ';"><span style="font-size:12px;">Порог совпадения:</span><input type="range" id="hh-resume-matching" min="0" max="100" step="5" value="' + safeMatching + '" style="width:100px;accent-color:' + violet + ';"><span id="hh-matching-value" style="color:' + violet + ';font-weight:600;">' + safeMatching + '%</span></div>' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;color:' + tc + ';"><span style="font-size:13px;">Задержка (сек):</span><input type="number" id="hh-delay" min="0.3" max="5" step="0.1" value="' + safeDelay + '" style="width:50px;padding:4px;border:1px solid ' + ib + ';border-radius:6px;background:' + ig + ';color:' + tc + ';text-align:center;"></div>' +
                        '<div style="margin-top:10px;border-top:1px solid ' + ib + ';padding-top:10px;">' +
                            '<label style="display:flex;align-items:center;font-size:13px;margin-bottom:6px;color:' + tc + ';cursor:pointer;">' +
                                '<input type="checkbox" id="hh-night-mode" ' + (bot.settings.nightModeEnabled ? 'checked' : '') + ' style="margin-right:8px;accent-color:' + violet + ';">' +
                                '<strong>&#x1F319; Ночной режим</strong>' +
                            '</label>' +
                            '<div id="hh-night-hours" style="display:' + (bot.settings.nightModeEnabled ? 'flex' : 'none') + ';align-items:center;gap:8px;font-size:12px;color:' + tc + ';margin-left:24px;">' +
                                '<span>с</span>' +
                                '<input type="number" id="hh-night-from" min="0" max="23" value="' + safeNum(bot.settings.nightModeFrom, 23) + '" style="width:44px;padding:3px;border:1px solid ' + ib + ';border-radius:6px;background:' + ig + ';color:' + tc + ';text-align:center;">' +
                                '<span>до</span>' +
                                '<input type="number" id="hh-night-to" min="0" max="23" value="' + safeNum(bot.settings.nightModeTo, 8) + '" style="width:44px;padding:3px;border:1px solid ' + ib + ';border-radius:6px;background:' + ig + ';color:' + tc + ';text-align:center;">' +
                                '<span style="color:' + st + ';">&#x447;&#x430;&#x441;&#x43E;&#x432;</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<div style="font-weight:bold;font-size:13px;margin-bottom:5px;color:' + tc + ';">\uD83D\uDEAB Фильтр организаций (ручной):</div>' +
                    '<textarea id="hh-filter-text" style="width:100%;height:80px;padding:8px;border:1px solid ' + ib + ';border-radius:8px;font-size:13px;resize:vertical;background:' + ig + ';color:' + tc + ';box-sizing:border-box;"></textarea>' +
                    '<div style="font-size:11px;color:' + st + ';margin-top:3px;">* Не откликаться на эти организации (полное или частичное совпадение)</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<div style="font-weight:bold;font-size:13px;margin-bottom:5px;color:' + tc + ';">\uD83D\uDD24 Стоп-слова в названии вакансии:</div>' +
                    '<textarea id="hh-title-stopwords" style="width:100%;height:56px;padding:8px;border:1px solid ' + ib + ';border-radius:8px;font-size:13px;resize:vertical;background:' + ig + ';color:' + tc + ';box-sizing:border-box;"></textarea>' +
                    '<div style="font-size:11px;color:' + st + ';margin-top:3px;">* Пропускать вакансии, в названии которых есть эти слова</div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:10px;margin:15px 0 10px;">' +
                    '<button id="hh-start" class="hhext-btn hhext-btn-start">\u25B6\uFE0F НАЧАТЬ АВТО-ОТКЛИК</button>' +
                    '<button id="hh-test" class="hhext-btn hhext-btn-test">\uD83E\uDDEA Тест на 1 вакансию</button>' +
                    '<button id="hh-stop" class="hhext-btn hhext-btn-stop" style="display:none;">\u23F9\uFE0F ОСТАНОВИТЬ</button>' +
                '</div>' +
                '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
                    '<button id="hh-analyze" class="hhext-btn hhext-btn-action">\uD83D\uDCCA Анализ</button>' +
                    '<button id="hh-test-filter" class="hhext-btn hhext-btn-action">\uD83D\uDD0D Тест фильтра</button>' +
                    '<button id="hh-show-auto-filter" class="hhext-btn hhext-btn-action">\uD83E\uDD16 Автофильтр</button>' +
                '</div>' +
                '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
                    '<button id="hh-clear" class="hhext-btn hhext-btn-action">\uD83D\uDDD1\uFE0F Очистить</button>' +
                    '<button id="hh-clear-auto-filter" class="hhext-btn hhext-btn-action" style="color:' + (isDark ? '#f87171' : '#ef4444') + ';">\uD83E\uDDF9 Автофильтр</button>' +
                '</div>' +
                '<div style="display:flex;gap:8px;margin-bottom:10px;"><button id="hh-export" class="hhext-btn hhext-btn-action">&#x1F4E4; Экспорт</button><button id="hh-import" class="hhext-btn hhext-btn-action">&#x1F4E5; Импорт</button><button id="hh-session-log" class="hhext-btn hhext-btn-action">&#x1F4CB; Лог</button></div><div style="text-align:center;font-size:10px;color:' + st + ';border-top:1px solid ' + ib + ';padding-top:10px;margin-top:15px;">By ALEX \uD83D\uDEE1\uFE0F Tech Guard | WASM ' + (W ? '\u2705' : '\u26A0\uFE0F') + ' | v' + escapeHtml(botVersion) + '</div>';

            const letterEl = d.querySelector('#hh-letter');
            if (letterEl) letterEl.value = bot.coverLetter || '';

            const filterEl = d.querySelector('#hh-filter-text');
            if (filterEl) {
                filterEl.value = (bot.filteredOrganizations || []).join(', ');
                filterEl.placeholder = 'Введите названия организаций через запятую\nПример: Яндекс, Google';
            }

            const stopWordsEl = d.querySelector('#hh-title-stopwords');
            if (stopWordsEl) {
                stopWordsEl.value = (bot.titleStopWords || []).join(', ');
                stopWordsEl.placeholder = 'Слова через запятую\nПример: стажёр, продажи, ночная смена';
            }

            // FIX: удаляем старую панель только после полного создания новой
            if (oldPanel) oldPanel.remove();

            return d;
        },

        createToggleButton: function(bot) {
            if (this._toggleListeners) {
                const oldBtn = document.getElementById('hh-toggle-btn');
                if (oldBtn) {
                    oldBtn.removeEventListener('mouseenter', this._toggleListeners.enter);
                    oldBtn.removeEventListener('mouseleave', this._toggleListeners.leave);
                }
                this._toggleListeners = null;
            }
            const existing = document.getElementById('hh-toggle-btn');
            if (existing) existing.remove();

            const tb = document.createElement('button');
            tb.id = 'hh-toggle-btn';
            tb.textContent = '\uD83D\uDE80';
            
            const isDark = bot.theme === 'dark';
            // FIX: убрано повторное объявление violetGlow — мёртвый код, переменная не использовалась
            
            Object.assign(tb.style, {
                position:'fixed', top:'60px', right:'20px', zIndex:'9999',
                background: isDark 
                    ? 'linear-gradient(135deg, #7c3aed, #a78bfa)' 
                    : 'linear-gradient(135deg, #a78bfa, #c4b5fd)',
                color:'white', border:'none', borderRadius:'14px', width:'50px', height:'50px',
                fontSize:'24px', cursor:'pointer', 
                boxShadow: isDark 
                    ? '0 4px 20px rgba(167,139,250,0.31), 0 0 30px rgba(167,139,250,0.13)' 
                    : '0 4px 16px rgba(167,139,250,0.19), 0 0 20px rgba(167,139,250,0.06)',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                padding: '0',
                boxSizing: 'border-box',
                fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
                lineHeight: '1'
            });

            const shadowBase = isDark 
                ? '0 4px 20px rgba(167,139,250,0.31), 0 0 30px rgba(167,139,250,0.13)'
                : '0 4px 16px rgba(167,139,250,0.19), 0 0 20px rgba(167,139,250,0.06)';
            const shadowHover = isDark 
                ? '0 8px 30px rgba(167,139,250,0.7), 0 0 50px rgba(167,139,250,0.35)'
                : '0 6px 24px rgba(167,139,250,0.5), 0 0 35px rgba(167,139,250,0.2)';
            
            const enterHandler = () => { 
                tb.style.transform = 'scale(1.08)'; 
                tb.style.boxShadow = shadowHover;
            };
            const leaveHandler = () => { 
                tb.style.transform = 'scale(1)'; 
                tb.style.boxShadow = shadowBase;
            };
            
            tb.addEventListener('mouseenter', enterHandler);
            tb.addEventListener('mouseleave', leaveHandler);
            
            this._toggleListeners = { enter: enterHandler, leave: leaveHandler };
            
            return tb;
        }
    };
})();
