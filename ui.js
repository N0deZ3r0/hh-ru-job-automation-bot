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
            const oldPanel = document.getElementById('hh-auto-panel');
            const d = document.createElement('div');
            d.id = 'hh-auto-panel';

            const isDark = bot.theme === 'dark';
            const W = window.__HH_WASM__;
            const S = bot.settings || {};
            const n = (v, f) => safeNum(v, f);

            // Палитра — та же, что была: фиолетовый акцент на тёмном фоне.
            const C = isDark ? {
                bg:'rgba(20,18,35,0.96)', panel:'rgba(255,255,255,0.04)', line:'rgba(167,139,250,0.22)',
                text:'#e8e6f5', dim:'#9b93bd', accent:'#a78bfa', accent2:'#7c3aed',
                field:'#241f38', ok:'#4ade80', bad:'#f87171', warn:'#fbbf24'
            } : {
                bg:'rgba(255,255,255,0.97)', panel:'rgba(124,58,237,0.04)', line:'rgba(124,58,237,0.18)',
                text:'#241f36', dim:'#6b6482', accent:'#7c3aed', accent2:'#6d28d9',
                field:'#ffffff', ok:'#16a34a', bad:'#dc2626', warn:'#d97706'
            };

            Object.assign(d.style, {
                position:'fixed', top:'96px', right:'20px', zIndex:'10000',
                background:C.bg, backdropFilter:'blur(14px)', WebkitBackdropFilter:'blur(14px)',
                color:C.text, border:'1px solid '+C.line, borderRadius:'18px',
                width:'min(400px, calc(100vw - 32px))', maxHeight:'86vh',
                display:'flex', flexDirection:'column', overflow:'hidden',
                boxShadow: isDark ? '0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)'
                                  : '0 24px 64px rgba(76,29,149,0.16), 0 0 0 1px rgba(0,0,0,0.03)',
                fontFamily:'-apple-system, Segoe UI, Roboto, Arial, sans-serif',
                fontSize:'13px', lineHeight:'1.45', boxSizing:'border-box'
            });

            // Звёзды переключателя темы
            let starsHTML = '';
            const seeds = [0.12,0.37,0.54,0.71,0.83,0.28,0.65];
            for (let i = 0; i < 7; i++) {
                const sd = seeds[i];
                starsHTML += '<div class="hhext-toggle-star" style="top:'+(3+sd*21).toFixed(1)+'px;left:'+(4+i*7.2+(sd*6-3)).toFixed(1)+'px;'
                    + 'width:'+(1.2+sd*2.2).toFixed(1)+'px;height:'+(1.2+sd*2.2).toFixed(1)+'px;'
                    + 'animation-duration:'+(1.6+sd*2.8).toFixed(1)+'s;animation-delay:'+(sd*2.4).toFixed(1)+'s;'
                    + '--max-opacity:'+(0.45+sd*0.55).toFixed(2)+';"></div>';
            }

            const dailyUsed = (bot.dailyStats && bot.dailyStats.date === (new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-'+String(new Date().getDate()).padStart(2,'0'))) ? (bot.dailyStats.count||0) : 0;
            const dailyPct = Math.min(100, Math.round(dailyUsed / 198 * 100));
            const letterWarn = (!S.skipCoverLetter && /\\[[^\\]]{0,40}\\]/.test(bot.coverLetter || '')) ? ' <span class="hhx-dot"></span>' : '';

            const tabs = [
                ['filters','Фильтры'], ['letter','Письмо'], ['skills','Навыки'],
                ['search','Поиск'], ['hh','hh.ru'], ['more','Ещё']
            ];
            const active = (bot.activeTab && tabs.some(t => t[0] === bot.activeTab)) ? bot.activeTab : 'filters';
            const tabBar = tabs.map(t => '<button class="hhx-tab'+(t[0]===active?' hhx-tab-on':'')+'" data-sec="'+t[0]+'">'+t[1]+(t[0]==='letter'?letterWarn:'')+'</button>').join('');
            const pane = (key, inner) => '<div class="hhx-pane" data-sec-body="'+key+'"'+(key===active?'':' style="display:none"')+'>'+inner+'</div>';

            // Конструкторы строк формы
            const row = (label, control, hint) => '<div class="hhx-row"><span class="hhx-lbl">'+label+'</span>'+control+'</div>'+(hint?'<div class="hhx-hint">'+hint+'</div>':'');
            const num = (id, min, max, step, val) => '<input class="hhx-num" type="number" id="'+id+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'">';
            const chk = (id, label, on, strong) => '<label class="hhx-chk"><input type="checkbox" id="'+id+'"'+(on?' checked':'')+'><span>'+(strong?'<b>'+label+'</b>':label)+'</span></label>';
            const sel = (id, opts, cur) => '<select class="hhx-sel" id="'+id+'">'+opts.map(o=>'<option value="'+o[0]+'"'+(o[0]===cur?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>';
            const ta  = (id, h, ph) => '<textarea class="hhx-ta" id="'+id+'" style="height:'+h+'px" placeholder="'+ph+'"></textarea>';
            const hint = (t) => '<div class="hhx-hint">'+t+'</div>';
            const group = (t) => '<div class="hhx-group">'+t+'</div>';
            const btn = (id, label, kind) => '<button class="hhx-btn'+(kind?' hhx-btn-'+kind:'')+'" id="'+id+'">'+label+'</button>';

            d.innerHTML =
                '<style>' +
                '#hh-auto-panel *{box-sizing:border-box}' +
                '#hh-auto-panel::-webkit-scrollbar,.hhx-body::-webkit-scrollbar{width:8px}' +
                '.hhx-body::-webkit-scrollbar-thumb{background:'+C.line+';border-radius:4px}' +
                '.hhx-head,.hhx-status,.hhx-metrics,.hhx-quota,.hhx-actions,.hhx-tabs,.hhx-foot{flex-shrink:0}' +
                '.hhx-head{display:flex;align-items:center;gap:10px;padding:14px 16px 12px;border-bottom:1px solid '+C.line+'}' +
                '.hhx-title{margin:0;font-size:14px;font-weight:700;color:'+C.accent+';white-space:nowrap}' +
                '.hhx-badge{font-size:9px;font-weight:700;letter-spacing:.04em;color:'+C.accent+';background:'+C.panel+';border:1px solid '+C.line+';padding:3px 6px;border-radius:6px}' +
                '.hhx-x{margin-left:auto;background:none;border:none;font-size:20px;line-height:1;cursor:pointer;color:'+C.dim+';padding:0 2px}' +
                '.hhx-x:hover{color:'+C.text+'}' +
                '.hhx-status{margin:12px 16px 0;padding:10px 12px;border-radius:10px;background:'+C.panel+';border:1px solid '+C.line+';color:'+C.text+';font-size:12px;line-height:1.5;white-space:pre-line;word-break:break-word;min-height:42px;max-height:150px;overflow-y:auto}' +
                '.hhx-metrics{display:flex;gap:6px;margin:10px 16px 0}' +
                '.hhx-m{flex:1;padding:7px 4px;border-radius:9px;background:'+C.panel+';border:1px solid '+C.line+';text-align:center}' +
                '.hhx-m b{display:block;font-size:15px;line-height:1.2;color:'+C.text+'}' +
                '.hhx-m span{font-size:9px;color:'+C.dim+';letter-spacing:.03em}' +
                '.hhx-quota{margin:10px 16px 0}' +
                '.hhx-quota-t{display:flex;justify-content:space-between;font-size:10px;color:'+C.dim+';margin-bottom:4px}' +
                '.hhx-bar{height:4px;border-radius:3px;background:'+C.line+';overflow:hidden}' +
                '.hhx-bar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,'+C.accent2+','+C.accent+')}' +
                '.hhx-actions{display:flex;flex-direction:column;gap:7px;padding:12px 16px 0}' +
                '.hhx-btn{width:100%;padding:9px 12px;border-radius:10px;border:1px solid '+C.line+';background:'+C.panel+';color:'+C.text+';font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s}' +
                '.hhx-btn:hover{border-color:'+C.accent+';background:'+(isDark?'rgba(167,139,250,0.14)':'rgba(124,58,237,0.08)')+'}' +
                '.hhx-btn-primary{background:linear-gradient(135deg,'+C.accent2+','+C.accent+');border-color:transparent;color:#fff;padding:12px;font-size:13px;box-shadow:0 6px 18px rgba(124,58,237,.32)}' +
                '.hhx-btn-primary:hover{filter:brightness(1.08);background:linear-gradient(135deg,'+C.accent2+','+C.accent+')}' +
                '.hhx-btn-stop{background:linear-gradient(135deg,#dc2626,#ef4444);border-color:transparent;color:#fff}' +
                '.hhx-btn-danger{color:'+C.bad+'}' +
                '.hhx-btn-row{display:flex;gap:7px}' +
                '.hhx-tabs{display:flex;gap:2px;margin:14px 12px 0;padding:3px;background:'+C.panel+';border:1px solid '+C.line+';border-radius:11px}' +
                '.hhx-tab{flex:1;padding:7px 2px;border:none;background:none;color:'+C.dim+';font-size:11px;font-weight:600;cursor:pointer;border-radius:8px;font-family:inherit;transition:.15s;position:relative}' +
                '.hhx-tab:hover{color:'+C.text+'}' +
                '.hhx-tab-on{background:'+(isDark?'rgba(167,139,250,0.18)':'#fff')+';color:'+C.accent+';box-shadow:0 1px 3px rgba(0,0,0,.12)}' +
                '.hhx-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:'+C.warn+';vertical-align:super;margin-left:2px}' +
                '.hhx-body{padding:14px 16px 16px;overflow-y:auto;flex:1}' +
                '.hhx-group{padding:10px 0;border-bottom:1px solid '+C.line+'}' +
                '.hhx-group:last-child{border-bottom:none;padding-bottom:0}' +
                '.hhx-cap{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:'+C.dim+';margin-bottom:8px}' +
                '.hhx-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:7px 0}' +
                '.hhx-lbl{font-size:12px;color:'+C.text+'}' +
                '.hhx-hint{font-size:10.5px;color:'+C.dim+';margin:-2px 0 8px;line-height:1.4}' +
                '.hhx-num,.hhx-sel{padding:5px 8px;border:1px solid '+C.line+';border-radius:8px;background:'+C.field+';color:'+C.text+';font-size:12px;font-family:inherit}' +
                '.hhx-num{width:74px;text-align:center}' +
                '.hhx-sel{max-width:172px}' +
                '.hhx-sel option{background:'+C.field+';color:'+C.text+'}' +
                '.hhx-num:focus,.hhx-sel:focus,.hhx-ta:focus{outline:none;border-color:'+C.accent+'}' +
                '.hhx-chk{display:flex;align-items:center;gap:9px;margin:8px 0;cursor:pointer;font-size:12px;color:'+C.text+'}' +
                '.hhx-chk input{width:15px;height:15px;accent-color:'+C.accent+';cursor:pointer;flex-shrink:0}' +
                '.hhx-ta{width:100%;padding:9px;border:1px solid '+C.line+';border-radius:10px;background:'+C.field+';color:'+C.text+';font-size:12px;font-family:inherit;resize:vertical;line-height:1.5}' +
                '.hhx-cnt{font-size:10px;color:'+C.dim+';text-align:right;margin-top:3px}' +
                '.hhx-foot{padding:9px 16px;border-top:1px solid '+C.line+';text-align:center;font-size:9.5px;color:'+C.dim+'}' +
                '@keyframes floatStars{0%,100%{transform:translateY(0) scale(.3);opacity:.04}35%{opacity:var(--max-opacity,.8)}50%{transform:translateY(-7px) scale(1.25);opacity:var(--max-opacity,1)}65%{opacity:.08}}' +
                '.hhext-toggle-star{position:absolute;background:#fff;border-radius:50%;box-shadow:0 0 2px rgba(255,255,255,.95),0 0 5px rgba(180,200,255,.55);animation:floatStars 3s ease-in-out infinite;pointer-events:none}' +
                '.hhext-toggle{position:relative;width:46px;height:24px;cursor:pointer;flex-shrink:0}' +
                '.hhext-toggle-track{position:absolute;inset:0;background:'+(isDark?'#141223':'#eeecf7')+';border-radius:12px;border:1px solid '+C.line+';overflow:hidden}' +
                '.hhext-toggle-stars{position:absolute;inset:0;pointer-events:none}' +
                '.hhext-toggle-thumb{position:absolute;top:2px;left:'+(isDark?'24px':'2px')+';width:18px;height:18px;border-radius:50%;background:'+(isDark?'linear-gradient(135deg,#c4b5fd,#a78bfa)':'linear-gradient(135deg,#fbbf24,#f59e0b)')+';box-shadow:0 2px 8px rgba(124,58,237,.45);transition:all .45s cubic-bezier(.34,1.56,.64,1);z-index:2}' +
                '.hhext-toggle-icon{position:absolute;top:50%;transform:translateY(-50%);font-size:9px;z-index:1;pointer-events:none}' +
                '.hhext-toggle-sun{left:5px;opacity:'+(isDark?'.3':'1')+'}' +
                '.hhext-toggle-moon{right:5px;opacity:'+(isDark?'1':'.3')+'}' +
                '</style>' +

                '<div class="hhx-head">' +
                    '<h3 class="hhx-title">HH Авто-отклик</h3>' +
                    '<span class="hhx-badge">' + (W ? 'WASM' : 'JS') + '</span>' +
                    '<div id="hh-theme-slider" class="hhext-toggle" style="margin-left:auto">' +
                        '<div class="hhext-toggle-track"><div class="hhext-toggle-stars">' + starsHTML + '</div></div>' +
                        '<div class="hhext-toggle-thumb"></div>' +
                        '<span class="hhext-toggle-icon hhext-toggle-sun">\u2600\uFE0F</span>' +
                        '<span class="hhext-toggle-icon hhext-toggle-moon">\uD83C\uDF19</span>' +
                    '</div>' +
                    '<button class="hhx-x" id="hh-close-btn">\u00D7</button>' +
                '</div>' +

                '<div class="hhx-status" id="hh-status">\u2705 Готов к работе</div>' +

                '<div class="hhx-metrics">' +
                    '<div class="hhx-m"><b id="hh-count">0</b><span>НАЙДЕНО</span></div>' +
                    '<div class="hhx-m"><b id="hh-stats" style="font-size:11px">\u27050 \u274C0 \u23ED\uFE0F0</b><span>ЗА СЕССИЮ</span></div>' +
                '</div>' +

                '<div class="hhx-quota">' +
                    '<div class="hhx-quota-t"><span>Суточный лимит hh.ru</span><span id="hh-quota-text">' + dailyUsed + ' / 198</span></div>' +
                    '<div class="hhx-bar"><i id="hh-quota-bar" style="width:' + dailyPct + '%"></i></div>' +
                '</div>' +

                '<div class="hhx-actions">' +
                    '<button class="hhx-btn hhx-btn-primary" id="hh-start">\u25B6\uFE0F Начать авто-отклик</button>' +
                    '<button class="hhx-btn hhx-btn-stop" id="hh-stop" style="display:none">\u23F9\uFE0F Остановить</button>' +
                    '<button class="hhx-btn" id="hh-test">\uD83E\uDDEA Тест на одной вакансии</button>' +
                '</div>' +

                '<div class="hhx-tabs">' + tabBar + '</div>' +

                '<div class="hhx-body">' +
                    pane('filters',
                        group('<div class="hhx-cap">Приоритет</div>' +
                            chk('hh-sort-competition','Сначала с меньшей конкуренцией', S.sortByCompetition, true) +
                            chk('hh-prefer-online','Сначала где рекрутёр онлайн', S.preferManagerOnline, true) +
                            hint('У онлайн-рекрутёров медиана откликов 72 против 237')) +
                        group('<div class="hhx-cap">Отсев вакансий</div>' +
                            row('Макс. откликов', num('hh-max-competitors',0,100000,10,n(S.maxCompetitors,0))) +
                            row('Мин. зарплата, \u20BD', num('hh-min-salary',0,100000000,10000,n(S.minSalary,0))) +
                            row('Не старше, дней', num('hh-max-age',0,365,1,n(S.maxAgeDays,0))) +
                            row('Макс. «висит», дней', num('hh-max-repost',0,365,1,n(S.maxRepostDays,0)),
                                'Разрыв между созданием и перепубликацией. «Сегодня» может значить, что вакансию перевыкладывают 4 месяца') +
                            row('Формат работы', sel('hh-work-format',[['any','любой'],['remote','только удалёнка'],['remote_hybrid','удалёнка/гибрид'],['on_site','только офис']], S.workFormat||'any')) +
                            row('Опыт не выше', sel('hh-max-experience',[['any','любой'],['noExperience','без опыта'],['between1And3','до 3 лет'],['between3And6','до 6 лет']], S.maxExperience||'any')) +
                            chk('hh-salary-required','Только с указанной зарплатой', S.salaryRequired) +
                            chk('hh-skip-internship','Пропускать стажировки', S.skipInternship) +
                            chk('hh-only-online','Только где рекрутёр онлайн', S.onlyManagerOnline) +
                            hint('0 = без ограничения')) +
                        group('<div class="hhx-cap">Работодатель</div>' +
                            row('Мин. рейтинг', num('hh-min-rating',0,5,0.1,n(S.minEmployerRating,0))) +
                            row('...если отзывов от', num('hh-min-reviews',1,100,1,n(S.minReviewsForRating,3))) +
                            row('Мин. % разбора откликов', num('hh-min-review-rate',0,100,5,n(S.minReviewRate,0)),
                                'hh.ru показывает это только после отклика. Бот запоминает по работодателю и отсеивает его следующие вакансии') +
                            chk('hh-filter-organizations','Фильтровать организации', S.filterOrganizations) +
                            chk('hh-auto-remember','Автодобавление в фильтр', S.autoRememberOrganizations)) +
                        group('<div class="hhx-cap">Слова и организации</div>' +
                            '<div class="hhx-lbl" style="margin-bottom:5px">Не откликаться этим организациям</div>' +
                            ta('hh-filter-text',56,'Яндекс, Google') + hint('Частичное совпадение, записи от 3 символов') +
                            '<div class="hhx-lbl" style="margin:8px 0 5px">Стоп-слова в названии</div>' +
                            ta('hh-title-stopwords',46,'стажёр, продажи') +
                            '<div class="hhx-lbl" style="margin:8px 0 5px">Обязательные слова в названии</div>' +
                            ta('hh-title-required',46,'javascript, frontend, разработчик') +
                            hint('Если список непуст — нужно хотя бы одно слово'))
                    ) +
                    pane('letter',
                        group(chk('hh-skip-cover-letter','\uD83D\uDEAB Не отправлять письмо', S.skipCoverLetter) +
                            ta('hh-letter',132,'Здравствуйте! ...') +
                            '<div class="hhx-cnt" id="hh-char-count">' + (bot.coverLetter||'').length + '/2000</div>' +
                            hint('Подстановки: {вакансия}, {компания}, {навыки}. Строка с незаполненной подстановкой выбрасывается целиком')) +
                        group('<div class="hhx-cap">Вариант B — A/B тест</div>' +
                            ta('hh-letter-b',92,'Второй вариант. Пусто — тест выключен') +
                            '<div class="hhx-cnt" id="hh-char-count-b">' + (bot.coverLetterB||'').length + '/2000</div>' +
                            hint('Письма пойдут поочерёдно, «Конверсия» покажет, какое работает')) +
                        group('<div class="hhx-cap">Резюме</div>' +
                            chk('hh-auto-select-resume','\uD83C\uDFAF Автовыбор резюме', S.autoSelectResume, true) +
                            '<div class="hhx-row"><span class="hhx-lbl">Порог совпадения</span>' +
                            '<span style="display:flex;align-items:center;gap:8px">' +
                            '<input type="range" id="hh-resume-matching" min="0" max="100" step="5" value="' + n(S.resumeTitleMatching,70) + '" style="width:96px;accent-color:'+C.accent+'">' +
                            '<b id="hh-matching-value" style="color:'+C.accent+';min-width:34px">' + n(S.resumeTitleMatching,70) + '%</b></span></div>')
                    ) +
                    pane('skills',
                        group('<div class="hhx-cap">Мои навыки</div>' +
                            ta('hh-my-skills',62,'Python, FastAPI, PostgreSQL, Docker') +
                            hint('Сравниваются с названием и текстом вакансии') +
                            row('Мин. совпадений', num('hh-min-skill-match',0,20,1,n(S.minSkillMatch,0))) +
                            chk('hh-sort-skills','Сначала под мои навыки', S.sortBySkills, true) +
                            chk('hh-deep-match','Точное сопоставление по странице вакансии', S.deepMatch, true) +
                            hint('Читает теги keySkills и полное описание. Точнее, но +~0.8 с на вакансию'))
                    ) +
                    pane('search',
                        group('<div class="hhx-cap">Фильтры на стороне hh.ru</div>' +
                            chk('hh-title-only','Искать только в названии вакансии', S.searchInTitleOnly, true) +
                            hint('Иначе hh.ru ищет по всему тексту: по «javascript» приходит даже машинист экскаватора') +
                            chk('hh-order-fresh','Сначала свежие вакансии', S.orderByFresh, true) +
                            hint('Медиана откликов у конкурентов падает с 273 до 13') +
                            chk('hh-no-agency','Без кадровых агентств', S.labelNoAgency) +
                            chk('hh-accredited-it','Только аккредитованные ИТ-компании', S.labelAccreditedIt) +
                            chk('hh-low-performance','Только «меньше 10 откликов»', S.labelLowPerformance) +
                            chk('hh-server-filters','Переносить мои фильтры в URL', S.serverSideFilters) +
                            btn('hh-optimize-search','\uD83D\uDD27 Оптимизировать текущий поиск')) +
                        group('<div class="hhx-cap">Очередь поисков</div>' +
                            ta('hh-search-queue',76,'https://hh.ru/search/vacancy?text=...') +
                            hint('По ссылке в строке. Запрос исчерпан — бот перейдёт к следующему') +
                            btn('hh-import-autosearch','\u2B50 Импортировать автопоиски hh.ru') +
                            chk('hh-auto-next','Автопереход на следующую страницу', S.autoNextPage) +
                            chk('hh-skip-responded','Пропускать уже откликнутые', S.skipResponded))
                    ) +
                    pane('hh',
                        group('<div class="hhx-cap">Резюме</div>' +
                            btn('hh-bump-resume','\u2B06\uFE0F Поднять резюме в поиске') +
                            chk('hh-auto-bump','Поднимать автоматически (раз в 4 ч)', S.autoBumpResume, true)) +
                        group('<div class="hhx-cap">Вакансии</div>' +
                            chk('hh-favorite-tests','\u2B50 Пропущенные из-за теста — в избранное', S.favoriteSkippedTests) +
                            chk('hh-notify-invites','\uD83D\uDD14 Уведомлять о приглашениях', S.notifyInvites, true) +
                            hint('Проверка раз в 15 минут, пока открыта вкладка hh.ru') +
                            btn('hh-blacklist-hh','\uD83D\uDEAB Скрыть отфильтрованных на hh.ru','danger') +
                            hint('Меняет аккаунт: работодатели пропадут из вашей выдачи. Спросит подтверждение'))
                    ) +
                    pane('more',
                        group('<div class="hhx-cap">Темп</div>' +
                            row('Задержка, сек', num('hh-delay',0.3,5,0.1,n(S.delay,1.5))) +
                            row('Случайный пропуск, %', num('hh-random-skip',0,50,1,n(S.randomSkipPercent,5)),
                                'Доля вакансий, которые бот намеренно пропустит. 0 = откликаться на все') +
                            chk('hh-night-mode','\uD83C\uDF19 Ночной режим', S.nightModeEnabled, true) +
                            '<div class="hhx-row" id="hh-night-hours" style="display:' + (S.nightModeEnabled?'flex':'none') + '">' +
                            '<span class="hhx-lbl">Пауза с / до</span><span style="display:flex;gap:6px">' +
                            num('hh-night-from',0,23,1,n(S.nightModeFrom,23)) + num('hh-night-to',0,23,1,n(S.nightModeTo,8)) +
                            '</span></div>') +
                        group('<div class="hhx-cap">Аналитика</div>' +
                            '<div class="hhx-btn-row">' + btn('hh-conversion','\uD83D\uDCC8 Конверсия') + btn('hh-export-csv','\uD83D\uDCC4 CSV') + '</div>' +
                            '<div class="hhx-btn-row" style="margin-top:7px">' + btn('hh-analyze','\uD83D\uDCCA Анализ') + btn('hh-test-filter','\uD83D\uDD0D Тест фильтра') + '</div>' +
                            '<div class="hhx-btn-row" style="margin-top:7px">' + btn('hh-show-auto-filter','\uD83E\uDD16 Автофильтр') + btn('hh-session-log','\uD83D\uDCCB Лог') + '</div>') +
                        group('<div class="hhx-cap">Данные</div>' +
                            '<div class="hhx-btn-row">' + btn('hh-export','\uD83D\uDCE4 Экспорт') + btn('hh-import','\uD83D\uDCE5 Импорт') + '</div>' +
                            '<div class="hhx-btn-row" style="margin-top:7px">' + btn('hh-clear','\uD83D\uDDD1\uFE0F Очистить','danger') + btn('hh-clear-auto-filter','\uD83E\uDDF9 Автофильтр','danger') + '</div>')
                    ) +
                '</div>' +
                '<div class="hhx-foot">By ALEX \uD83D\uDEE1\uFE0F Tech Guard \u00B7 v' + escapeHtml(bot.version || '2.4') + ' \u00B7 WASM ' + (W ? '\u2705' : '\u26A0\uFE0F') + '</div>';

            // Значения текстовых полей
            const setv = (id, v) => { const el = d.querySelector('#' + id); if (el) el.value = v || ''; };
            setv('hh-letter', bot.coverLetter);
            setv('hh-letter-b', bot.coverLetterB);
            setv('hh-filter-text', (bot.filteredOrganizations || []).join(', '));
            setv('hh-title-stopwords', (bot.titleStopWords || []).join(', '));
            setv('hh-title-required', (bot.titleRequiredWords || []).join(', '));
            setv('hh-my-skills', (bot.mySkills || []).join(', '));
            setv('hh-search-queue', (bot.searchQueue || []).join('\n'));
            const le = d.querySelector('#hh-letter');
            if (le && bot.settings.skipCoverLetter) { le.style.opacity = '.5'; le.style.pointerEvents = 'none'; }

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
            // [FIX] Класс не навешивался, а стили выше объявлены как
            // .hh-toggle-btn и .hh-toggle-btn.hh-toggle-running. Селектор из двух
            // классов не совпадал ни с чем, поэтому кнопка не краснела на время
            // работы, а правила :hover и transition были мёртвыми.
            tb.className = 'hh-toggle-btn';
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
