// ===== HH-PROTECT.JS — MAIN WORLD FINGERPRINT PROTECTION (с WASM Canvas) =====
(function() {
    'use strict';

    // [FIX iframe Date.now] Не запускаем fingerprint-патчи в iframe.
    if (window.top !== window.self) return;

    // [FIX двойное выполнение] Флаг гарантирует однократный запуск патчей.
    if (window.__hh_injected__) return;
    window.__hh_injected__ = true;

    // ── ЗАХВАТ НАТИВНЫХ ФУНКЦИЙ ──────────────────────────────────────────────
    // Делаем это в самом начале IIFE — до того как страница или другие скрипты
    // могут заменить Date, performance, crypto и т.д.
    // Эти ссылки используются внутри initProtection и applyStubs.
    var _NativeDateNow       = (typeof Date !== 'undefined' && typeof Date.now === 'function')
                                ? Date.now.bind(Date) : function() { return +new Date(); };
    var _NativePerfNow       = (typeof performance !== 'undefined' && typeof performance.now === 'function')
                                ? performance.now.bind(performance) : _NativeDateNow;
    var _NativeDate          = (typeof Date !== 'undefined') ? Date : null;
    var _NativeCrypto        = (typeof crypto !== 'undefined') ? crypto : null;
    var _NativeGetRandValues = _NativeCrypto && typeof _NativeCrypto.getRandomValues === 'function'
                                ? _NativeCrypto.getRandomValues.bind(_NativeCrypto) : null;
    // ─────────────────────────────────────────────────────────────────────────

    var ID = window.__HH_PROFILE_DATA__;

    // [FIX RACE CONDITION] Если профиля нет — применяем заглушки немедленно,
    // а после получения реальных данных перезаписываем их.
    if (!ID) {
        applyStubs();
        // FIX: была ОДНА попытка через 100мс. Если background.js не успевал выполнить
        // executeScript (а он гонится с document_start), защита не включалась вообще
        // до конца жизни вкладки. Теперь опрашиваем до 2 секунд.
        var _profileTries = 0;
        var _pollProfile = function() {
            ID = window.__HH_PROFILE_DATA__;
            if (ID) { initProtection(ID); return; }
            if (++_profileTries < 40) setTimeout(_pollProfile, 50);
        };
        setTimeout(_pollProfile, 50);
        return;
    }

    initProtection(ID);

    // Минимальные безопасные заглушки до загрузки профиля.
    // Гарантируют, что страница не снимет реальный отпечаток в окно 0–100 мс.
    function applyStubs() {
        try {
            Object.defineProperty(Navigator.prototype, 'webdriver', {
                get: function() { return false; },
                configurable: true
            });
        } catch(e) {}
        // [FIX] Заглушки userAgent/platform/doNotTrack УДАЛЕНЫ.
        // Они подставляли зашитый Chrome/148 и Win32 в окне до прихода профиля,
        // хотя расширение не переписывает исходящие заголовки — сервер всё это время
        // видел настоящий User-Agent. Замер на живой машине: браузер Chrome 152,
        // то есть заглушка сама создавала расхождение, которого иначе не было бы.
        // doNotTrack:'1' тоже убран: в Chrome по умолчанию null (проверено),
        // и единица не скрывает пользователя, а добавляет ему энтропии.
        // Остаётся только webdriver — единственное, что действительно надо скрыть.
    }

    function initProtection(ID) {

    // ── МАСКИРОВКА ПАТЧЕЙ ПОД NATIVE CODE ────────────────────────────────
    // Объявлено в начале initProtection: _def ниже помечает свои геттеры сразу,
    // а сам Function.prototype.toString патчится в конце функции.
    var _nativeLookupSet = new WeakSet();
    var _markNative = function(fn, name) {
        if (typeof fn === 'function') {
            _nativeLookupSet.add(fn);
            try { Object.defineProperty(fn, 'name', { value: name || fn.name, configurable: true }); } catch(e) {}
        }
        return fn;
    };

    // ── ЗАГРУЗКА WASM В MAIN WORLD ───────────────────────────────────────
    // core.js грузит WASM в ISOLATED world, но патчи отпечатка живут здесь,
    // в MAIN world, и это разные window — дотянуться до того экземпляра нельзя.
    // Синхронные API (measureText, getParameter, getChannelData) исключают мост
    // через postMessage, поэтому модуль инстанцируется прямо тут.
    // chrome.runtime в MAIN world нет, ссылки приходят в профиле.
    // Glue грузится через new Function, а не тегом <script>: иначе var ProtectModule
    // стал бы неудаляемым свойством window и сам выдавал бы расширение странице.
    var _wasm = null;
    function getWasm() {
        if (_wasm) return _wasm;
        try {
            var w = window.__HH_WASM__;   // на случай, если модуль появится извне
            return (w && typeof w.addCanvasNoise === 'function') ? w : null;
        } catch(e) { return null; }
    }

    function _buildWasmWrapper(M) {
        var enc = new TextEncoder();
        function withBytes(bytes, fn) {
            var p = M._malloc(bytes.length);
            if (!p) return null;
            try {
                for (var i = 0; i < bytes.length; i++) M.setValue(p + i, bytes[i], 'i8');
                return fn(p, bytes.length);
            } finally { M._free(p); }
        }
        return {
            addCanvasNoise: function(imageData) {
                var px = imageData.data, len = px.length;
                if (!len) return false;
                var p = M._malloc(len);
                if (!p) return false;
                try {
                    for (var i = 0; i < len; i++) M.setValue(p + i, px[i], 'i8');
                    M._add_canvas_noise(p, imageData.width, imageData.height, imageData.width * 4, len);
                    for (var j = 0; j < len; j++) px[j] = M.getValue(p + j, 'i8') & 0xFF;
                    return true;
                } finally { M._free(p); }
            },
            substituteTextWidth: function(width, text) {
                var b = enc.encode(String(text));
                var out = withBytes(new Uint8Array(b.length + 1), function(p) {
                    for (var i = 0; i < b.length; i++) M.setValue(p + i, b[i], 'i8');
                    M.setValue(p + b.length, 0, 'i8');
                    return M._substitute_text_width(width, p);
                });
                return (typeof out === 'number' && isFinite(out)) ? out : width;
            },
            addAudioNoise: function(floatArray, intensity) {
                var n = floatArray.length;
                if (!n) return false;
                var p = M._malloc(n * 4);
                if (!p) return false;
                try {
                    for (var i = 0; i < n; i++) M.setValue(p + i * 4, floatArray[i], 'float');
                    M._add_audio_noise(p, n, intensity);
                    for (var j = 0; j < n; j++) floatArray[j] = M.getValue(p + j * 4, 'float');
                    return true;
                } finally { M._free(p); }
            },
            getWebGLMaxAnisotropy: function() { return M._get_webgl_max_anisotropy(); }
        };
    }

    (function loadWasmIntoMainWorld() {
        var glueUrl = ID.wasmGlueUrl, binUrl = ID.wasmBinaryUrl;
        if (!glueUrl || !binUrl) return;
        (async function() {
            try {
                var src = await (await fetch(glueUrl)).text();
                var factory = new Function(src + '\nreturn ProtectModule;')();
                var M = await factory({ locateFile: function() { return binUrl; } });
                // Сид — как в core.js, иначе шум будет одинаковым у всех
                try {
                    var sa = new Uint32Array(8);
                    (_NativeGetRandValues || crypto.getRandomValues.bind(crypto))(sa);
                    var sp = M._malloc(32);
                    if (sp) {
                        try {
                            for (var i = 0; i < 8; i++) M.setValue(sp + i * 4, sa[i], 'i32');
                            M._seed_random(sp, 8);
                        } finally { M._free(sp); }
                    }
                } catch(e) {}
                _wasm = _buildWasmWrapper(M);
            } catch(e) {
                // CSP, отсутствие ресурса, что угодно — остаёмся на JS-фолбэках
            }
        })();
    })();

    function _def(obj, prop, value) {
        try {
            // FIX: геттер помечаем как native. Раньше
            // Object.getOwnPropertyDescriptor(Navigator.prototype,'userAgent').get.toString()
            // возвращал "function() { return value; }" — подмена палилась одной строкой.
            var getter = _markNative(function() { return value; }, 'get ' + prop);
            Object.defineProperty(obj, prop, {
                get: getter,
                configurable: true,
                enumerable: true
            });
        } catch(e) {}
    }

    // ===== DEVICE PIXEL RATIO =====
    // [FIX] Патчим только если профиль реально задаёт значение. Раньше DPR
    // безусловно прибивался к 1, а медиазапрос (resolution: Ndppx) не трогался —
    // на экране с DPR 1.25 получалось прямое противоречие.
    if (ID.devicePixelRatio) {
        try {
            Object.defineProperty(window, 'devicePixelRatio', {
                get: _markNative(function() { return ID.devicePixelRatio; }, 'get devicePixelRatio'),
                configurable: true
            });
        } catch(e) {}
    }

    // ===== TIMEZONE =====
    // [FIX Intl.DateTimeFormat] Копируем статические методы и правильно
    // выстраиваем цепочку прототипов через Object.setPrototypeOf.
    // [FIX] Ставим патч только если зона профиля отличается от настоящей —
    // иначе это лишний слой поверх Intl без единого изменённого значения.
    var _realTZ = null;
    try { _realTZ = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch(e) {}
    if (ID.timezone && ID.timezone !== _realTZ) {
        try {
            var OrigDTF = Intl.DateTimeFormat;
            var PatchedDTF = function(loc, opts) {
                opts = opts ? Object.assign({}, opts) : {};
                if (!opts.timeZone) opts.timeZone = ID.timezone;
                if (ID.language && !loc) loc = ID.language;
                return Reflect.construct(OrigDTF, [loc, opts], new.target || OrigDTF);
            };
            // Выстраиваем цепочку прототипов в обе стороны
            PatchedDTF.prototype = Object.create(OrigDTF.prototype);
            PatchedDTF.prototype.constructor = PatchedDTF;
            // [FIX resolvedOptions] Патчим resolvedOptions — Reflect.construct возвращает
            // нативный объект, его resolvedOptions() отдаёт реальный timezone системы.
            // Перехватываем и подменяем timeZone в результате.
            var _origRO = OrigDTF.prototype.resolvedOptions;
            PatchedDTF.prototype.resolvedOptions = function() {
                var result = _origRO.call(this);
                // Создаём новый объект с подменённым timezone
                return Object.assign({}, result, { timeZone: ID.timezone });
            };
            // Копируем статические методы (supportedLocalesOf и др.)
            Object.setPrototypeOf(PatchedDTF, OrigDTF);
            Intl.DateTimeFormat = PatchedDTF;
            // [FIX resolvedOptions на прототипе] Патчим и нативный прототип —
            // код который вызывает resolvedOptions() на объектах созданных до патча
            OrigDTF.prototype.resolvedOptions = function() {
                var result = _origRO.call(this);
                return Object.assign({}, result, { timeZone: ID.timezone });
            };
        } catch(e) {}
    }

    // ===== CANVAS (WASM Noise) =====
    (function() {
        var CACHE_TTL = 5000;
        var canvasCache = new WeakMap();
        // Отдельный WeakMap для отслеживания «в процессе» toBlob-вызовов —
        // предотвращает накопление колбэков при быстрых повторных вызовах.
        var blobPending = new WeakMap();

        var origTD = HTMLCanvasElement.prototype.toDataURL;
        var origTB = HTMLCanvasElement.prototype.toBlob;
        // Сохраняем оригинальный getImageData до его патча ниже,
        // чтобы applyCanvasNoise работал с чистыми пикселями.
        var origGID = CanvasRenderingContext2D.prototype.getImageData;

        // [FIX подмена контекста] applyCanvasNoise вызывает canvas.getContext('2d').
        // На холсте без контекста этот вызов СОЗДАЁТ 2d-контекст, после чего
        // getContext('webgl') на том же холсте навсегда возвращает null — страница
        // теряет WebGL. Запоминаем, у каких холстов 2d-контекст уже есть,
        // и шумим только их.
        var _has2d = new WeakSet();
        var _origGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type) {
            var c = _origGetContext.apply(this, arguments);
            if (c && (type === '2d' || type === 'experimental-2d')) _has2d.add(this);
            return c;
        };

        // Сид стабилен в пределах сессии: один и тот же canvas даёт один и тот же
        // отпечаток при повторных чтениях, но разный между сессиями.
        var _canvasSeed = (function() {
            if (_NativeGetRandValues) {
                var b = new Uint32Array(1);
                _NativeGetRandValues(b);
                return b[0] || 1;
            }
            return ((Math.random() * 0xFFFFFFFF) >>> 0) || 1;
        })();

        function jsCanvasNoise(imageData) {
            var d = imageData.data, seed = _canvasSeed;
            for (var i = 0; i < d.length; i += 4) {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                var ch = (seed >>> 28) & 3;          // 3 = пропустить пиксель
                if (ch > 2) continue;
                // Uint8ClampedArray сам обрезает выход за 0..255
                d[i + ch] += ((seed >>> 27) & 1) ? 1 : -1;
            }
        }

        // [FIX накопительный шум] Используем offscreen-canvas как буфер:
        // читаем пиксели оригинала через нативный getImageData (не через патч),
        // добавляем шум в копию, записываем копию обратно. Оригинальные данные
        // не мутируются многократно — каждый вызов получает свежую копию.
        function applyCanvasNoise(canvas) {
            if (!canvas || !canvas.width || !canvas.height) return false;
            var wasm = getWasm();
            // [ВАЖНО] should_skip_canvas_noise из WASM НЕ используется намеренно.
            // Замер: 1x1, 16x16 и 200x60 он велит ПРОПУСТИТЬ, а 1920x1080 — шуметь.
            // Это ровно наоборот: отпечаток снимают с маленьких холстов (200x60,
            // 280x60, 300x150), а большие — настоящая графика страницы.
            // Своё правило: шумим всё, кроме заведомо крупных холстов.
            if (canvas.width * canvas.height > 1048576) return false;

            if (!_has2d.has(canvas)) return false;
            try {
                var ctx = _origGetContext.call(canvas, '2d');
                if (!ctx) return false;
                // Используем сохранённый оригинал — не проходим через патч getImageData
                var imageData = origGID.call(ctx, 0, 0, canvas.width, canvas.height);
                if (wasm) {
                    try { wasm.addCanvasNoise(imageData); } catch(e) { jsCanvasNoise(imageData); }
                } else {
                    jsCanvasNoise(imageData);
                }
                ctx.putImageData(imageData, 0, 0);
                return true;
            } catch(e) {
                return false;
            }
        }

        // [FIX canvas noise once] WeakMap для отслеживания canvas к которым уже применён шум.
        // applyCanvasNoise мутирует canvas — повторное применение накапливало артефакты.
        var noiseApplied = new WeakSet();

        HTMLCanvasElement.prototype.toDataURL = function(fmt, q) {
            var now = _NativeDateNow();
            // [FIX нормализация fmt] undefined → 'image/png' (стандарт HTML5)
            var normFmt = fmt || 'image/png';
            var cacheKey = normFmt + '|' + (q === undefined ? '' : String(q));
            var entry = canvasCache.get(this) || {};

            if (entry.urls && entry.urls[cacheKey] && (now - entry.ts < CACHE_TTL)) {
                return entry.urls[cacheKey];
            }

            // [FIX noise once] Применяем шум только один раз на canvas —
            // последующие вызовы (с другим fmt) берут уже зашумлённые пиксели.
            if (this.width > 0 && this.height > 0 && !noiseApplied.has(this)) {
                if (applyCanvasNoise(this)) noiseApplied.add(this);
            }

            var result = origTD.call(this, normFmt, q);
            entry.urls = entry.urls || {};
            entry.urls[cacheKey] = result;
            entry.ts = now;
            canvasCache.set(this, entry);
            return result;
        };

        if (origTB) {
            HTMLCanvasElement.prototype.toBlob = function(callback, fmt, q) {
                var now = _NativeDateNow();
                // [FIX кеш fmt/q] Тот же составной ключ что и в toDataURL
                var cacheKey = (fmt || 'image/png') + '|' + (q === undefined ? '' : q);
                var cached = canvasCache.get(this);
                if (cached && cached.blobs && cached.blobs[cacheKey] && (now - cached.ts < CACHE_TTL)) {
                    callback(cached.blobs[cacheKey]);
                    return;
                }

                // [FIX утечка замыкания] Дебаунс: если вызов уже идёт —
                // ставим в очередь только последний колбэк, не накапливаем N замыканий.
                if (blobPending.get(this)) {
                    blobPending.set(this, { callback: callback, fmt: fmt, q: q });
                    return;
                }
                blobPending.set(this, true);

                // [FIX noise once] Тот же WeakSet, что и в toDataURL: без него
                // повторные toBlob накапливали шум на одном и том же холсте.
                if (this.width > 0 && this.height > 0 && !noiseApplied.has(this)) {
                    if (applyCanvasNoise(this)) noiseApplied.add(this);
                }

                // [FIX this в колбэке] Сохраняем явную ссылку вместо .bind()
                // [FIX ts timing] Фиксируем время начала вызова, а не завершения колбэка —
                // TTL отсчитывается от одной точки и в toDataURL, и в toBlob.
                var blobStartTime = _NativeDateNow();
                var self = this;
                origTB.call(self, function(blob) {
                    var entry2 = canvasCache.get(self) || {};
                    entry2.blobs = entry2.blobs || {};
                    entry2.blobs[cacheKey] = blob;
                    entry2.ts = blobStartTime;
                    canvasCache.set(self, entry2);

                    callback(blob);

                    // Если за время ожидания пришёл новый запрос — выполняем его
                    var pending = blobPending.get(self);
                    blobPending.delete(self);
                    if (pending && pending.callback) {
                        HTMLCanvasElement.prototype.toBlob.call(self, pending.callback, pending.fmt, pending.q);
                    }
                }, fmt, q);
            };
        }

        // [FIX накопительный шум getImageData] Патч добавляет шум только
        // к возвращаемым данным (не записывает обратно в canvas), поэтому
        // он независим от applyCanvasNoise, который теперь использует origGID.
        // Двойного шума нет: applyCanvasNoise → origGID (без патча),
        // внешний код → патч (только для чтения, не мутирует canvas).
        if (origGID) {
            CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
                var data = origGID.call(this, x, y, w, h);
                // [FIX RGB шум] Реальный hardware-шум затрагивает R, G, B каналы.
                // Старый код менял только альфа (i%4===3) — детектируемая сигнатура.
                // Теперь добавляем ±1 шум в R, G, B случайно через LCG-сид.
                var seed = (x * 0x9E3779B1 + y * 0xC2B2AE35) ^ (w * 0x27D4EB2F + h * 0x85EBCA6B);
                var d = data.data;
                for (var i = 0; i < d.length; i += 4) {
                    seed = (seed * 1664525 + 1013904223) >>> 0;
                    var noise = (seed >>> 30) & 1; // 0 или 1
                    var channel = (seed >>> 28) & 3; // 0=R, 1=G, 2=B, 3=skip
                    if (channel < 3) {
                        var idx = i + channel;
                        d[idx] = d[idx] + noise > 255 ? 254 : d[idx] + noise;
                    }
                }
                return data;
            };
        }
    })();

    // ===== TEXT METRICS (WASM) =====
    // Перечисление шрифтов делают не через document.fonts.check, а измеряя ширину
    // строки в разных гарнитурах. Замер на живой машине: Arial 936.92, Wingdings
    // 1046.84, Impact 832.08 — набор установленных шрифтов читался полностью,
    // потому что measureText никто не трогал.
    // substitute_text_width из WASM даёт детерминированный сдвиг ~0.0001-0.013%:
    // вёрстку это не двигает, а таблицу ширин делает уникальной для профиля.
    try {
        var _origMeasureText = CanvasRenderingContext2D.prototype.measureText;
        // Кеш держит значение стабильным в пределах сессии: повторное измерение
        // той же строки тем же шрифтом обязано давать тот же результат.
        var _twCache = new Map();
        CanvasRenderingContext2D.prototype.measureText = function(text) {
            var tm = _origMeasureText.call(this, text);
            var w = getWasm();
            if (!w || !w.substituteTextWidth) return tm;
            try {
                var key = this.font + '\u0000' + String(text);
                var val = _twCache.get(key);
                if (val === undefined) {
                    val = w.substituteTextWidth(tm.width, String(text));
                    if (_twCache.size > 500) _twCache.clear();
                    _twCache.set(key, val);
                }
                // Подменяем width на самом объекте TextMetrics — instanceof и
                // остальные поля остаются нативными.
                Object.defineProperty(tm, 'width', { value: val, configurable: true, enumerable: true });
            } catch(e) {}
            return tm;
        };
    } catch(e) {}

    // ===== AUDIO (WASM) =====
    // Классический аудио-отпечаток: OfflineAudioContext + DynamicsCompressor,
    // затем сумма отрендеренного буфера. Замер на живой машине давал стабильные
    // 1079.88727944 — значение снималось без каких-либо помех.
    // add_audio_noise сдвигает отсчёты примерно на 2e-5 (около -94 дБ) — неслышимо.
    try {
        var _audioNoised = new WeakSet();
        var AUDIO_INTENSITY = 0.0001;
        if (typeof AudioBuffer !== 'undefined' && AudioBuffer.prototype.getChannelData) {
            var _origGetChannelData = AudioBuffer.prototype.getChannelData;
            AudioBuffer.prototype.getChannelData = function(channel) {
                var data = _origGetChannelData.call(this, channel);
                var w = getWasm();
                if (w && w.addAudioNoise && data && !_audioNoised.has(data)) {
                    _audioNoised.add(data);
                    try { w.addAudioNoise(data, AUDIO_INTENSITY); } catch(e) {}
                }
                return data;
            };
        }
        if (typeof AnalyserNode !== 'undefined' && AnalyserNode.prototype.getFloatFrequencyData) {
            var _origGFFD = AnalyserNode.prototype.getFloatFrequencyData;
            AnalyserNode.prototype.getFloatFrequencyData = function(array) {
                _origGFFD.call(this, array);
                var w = getWasm();
                if (w && w.addAudioNoise && array) {
                    try { w.addAudioNoise(array, AUDIO_INTENSITY); } catch(e) {}
                }
            };
        }
    } catch(e) {}

    // ===== WEBGL =====
    try {
        var g1 = WebGLRenderingContext.prototype;
        var origGP1 = g1.getParameter;
        g1.getParameter = function(p) {
            if (p === 0x1F00 || p === 0x9245) return ID.webglVendor;
            if (p === 0x1F01 || p === 0x9246) return ID.webglRenderer;
            // MAX_TEXTURE_MAX_ANISOTROPY_EXT — тоже часть отпечатка GPU
            if (p === 0x84FF) {
                var w = getWasm();
                if (w && w.getWebGLMaxAnisotropy) { try { return w.getWebGLMaxAnisotropy(); } catch(e) {} }
            }
            if (ID.webglParams && ID.webglParams[p] !== undefined) return ID.webglParams[p];
            try { return origGP1.call(this, p); } catch(e) { return null; }
        };

        // [FIX противоречие] Прежний код прятал WEBGL_debug_renderer_info из
        // getSupportedExtensions и возвращал null из getExtension — но getParameter
        // при этом продолжал отвечать на 0x9245/0x9246. Настоящий Chrome так не умеет:
        // проверено, расширение поддерживается и getExtension отдаёт объект.
        // Такая пара «расширения нет, но параметры его есть» — готовый маркер.
        // Оставляем расширение на месте, подменяя только сами значения.

        if (typeof WebGL2RenderingContext !== 'undefined') {
            var g2 = WebGL2RenderingContext.prototype;
            var origGP2 = g2.getParameter;
            g2.getParameter = function(p) {
                if (p === 0x1F00 || p === 0x9245) return ID.webglVendor;
                if (p === 0x1F01 || p === 0x9246) return ID.webglRenderer;
                if (p === 0x84FF) {
                    var w = getWasm();
                    if (w && w.getWebGLMaxAnisotropy) { try { return w.getWebGLMaxAnisotropy(); } catch(e) {} }
                }
                if (ID.webglParams && ID.webglParams[p] !== undefined) return ID.webglParams[p];
                return origGP2.call(this, p);
            };
        }
    } catch(e) {}

    // ===== SCREEN =====
    if (ID.screenWidth) {
        try {
            _def(Screen.prototype, 'width', ID.screenWidth);
            _def(Screen.prototype, 'height', ID.screenHeight);
            _def(Screen.prototype, 'availWidth', ID.screenWidth);
            _def(Screen.prototype, 'availHeight', Math.round(ID.screenHeight * 0.963 / 8) * 8);
        } catch(e) {}
    }

    // ===== NAVIGATOR =====
    // [FIX лишние патчи] Каждый подменённый геттер — это поверхность для детекта,
    // поэтому ставим его только там, где значение действительно меняется.
    // Замер на живой машине: vendor, maxTouchPoints, pdfViewerEnabled и webdriver
    // и так совпадали с профилем — четыре патча стояли впустую.
    function _defIfDiff(obj, prop, value, real) {
        if (value === undefined || value === null) return;
        var same = Array.isArray(value)
            ? JSON.stringify(value) === JSON.stringify(Array.from(real || []))
            : String(value) === String(real);
        if (same) return;
        _def(obj, prop, value);
    }

    try {
        var np = Navigator.prototype;
        _defIfDiff(np, 'platform', ID.platform, navigator.platform);
        _defIfDiff(np, 'hardwareConcurrency', ID.hwConcurrency, navigator.hardwareConcurrency);
        _defIfDiff(np, 'deviceMemory', ID.deviceMemory, navigator.deviceMemory);
        _defIfDiff(np, 'vendor', ID.vendor, navigator.vendor);
        _defIfDiff(np, 'language', ID.language, navigator.language);
        _defIfDiff(np, 'languages', ID.languages, navigator.languages);
        if (ID.userAgent) {
            _defIfDiff(np, 'userAgent', ID.userAgent, navigator.userAgent);
            _defIfDiff(np, 'appVersion', ID.appVersion || ID.userAgent.replace(/^Mozilla\//, ''), navigator.appVersion);
        }
        // webdriver — единственное, что скрываем всегда: true выдаёт автоматизацию
        if (navigator.webdriver !== false) _def(np, 'webdriver', false);

        // [FIX] Убраны patch'и doNotTrack='1' и обнуление bluetooth/usb/serial/hid.
        // В настоящем Chrome doNotTrack === null, а navigator.bluetooth и соседи —
        // живые объекты (проверено). Прежний код оставлял ключ в navigator, но отдавал
        // undefined — состояние, которого у настоящего браузера не бывает вообще.
    } catch(e) {}

    // ===== CLIENT HINTS =====
    try {
        var uad = navigator.userAgentData;
        // [FIX] Если профиль повторяет реальные бренды и платформу — не патчим вовсе.
        var _chDiffers = false;
        try {
            _chDiffers = !!(ID.clientHints && (
                JSON.stringify(ID.clientHints.brands || null) !== JSON.stringify(uad ? uad.brands : null) ||
                (ID.clientHints.platform && ID.clientHints.platform !== (uad && uad.platform))
            ));
        } catch(e) { _chDiffers = true; }
        if (uad && ID.clientHints && _chDiffers) {
            var ch = ID.clientHints;
            if (ch.brands) _def(uad, 'brands', ch.brands);
            if (ch.platform) _def(uad, 'platform', ch.platform);
            _def(uad, 'mobile', ch.mobile || false);
            if (uad.getHighEntropyValues) {
                var uadProto = Object.getPrototypeOf(uad);
                // Сохраняем оригинал с прототипа чтобы избежать рекурсии
                var _origHEV = uadProto.getHighEntropyValues || uad.getHighEntropyValues;
                var hevPatch = function(hints) {
                    // Вызываем оригинал явно через .call(this) — this = текущий uad объект
                    return _origHEV.call(this, hints).then(function(r) {
                        // [FIX platformVersion] Object.assign: f перезаписывает r —
                        // реальные значения браузера заменяются нашими из профиля
                        var f = {};
                        if (hints.includes('platformVersion')) f.platformVersion = ch.platformVersion || '10.0.0';
                        if (hints.includes('architecture'))    f.architecture    = ch.architecture    || 'x86';
                        if (hints.includes('bitness'))         f.bitness         = ch.bitness         || '64';
                        if (hints.includes('wow64'))           f.wow64           = ch.wow64           || false;
                        if (hints.includes('model'))           f.model           = ch.model           || '';
                        if (hints.includes('uaFullVersion'))   f.uaFullVersion   = ch.uaFullVersion   || '148.0.0.0';
                        if (hints.includes('fullVersionList')) f.fullVersionList = ch.fullVersionList || [];
                        if (hints.includes('formFactors'))     f.formFactors     = ch.formFactors     || ['Desktop'];
                        return Object.assign({}, r, f);
                    });
                };
                // Патчим прототип — перехватывает все вызовы включая из сторонних скриптов
                try {
                    if (uadProto && uadProto !== Object.prototype) {
                        Object.defineProperty(uadProto, 'getHighEntropyValues', {
                            value: hevPatch, configurable: true, writable: true
                        });
                    }
                } catch(e) {}
                // Патчим экземпляр как fallback
                try { uad.getHighEntropyValues = hevPatch; } catch(e) {}
            }
        }
    } catch(e) {}

    // ===== PERMISSIONS =====
    try {
        var perm = navigator.permissions;
        if (perm && perm.query) {
            var origQuery = perm.query.bind(perm);
            perm.query = function(desc) {
                return origQuery(desc).then(function() {
                    return { state: 'prompt', onchange: null, addEventListener: function() {}, removeEventListener: function() {} };
                }).catch(function() {
                    return { state: 'prompt', onchange: null, addEventListener: function() {}, removeEventListener: function() {} };
                });
            };
        }
    } catch(e) {}

    // ===== MEDIA DEVICES =====
    try {
        var md = navigator.mediaDevices;
        if (md && md.enumerateDevices) {
            var origED = md.enumerateDevices.bind(md);
            md.enumerateDevices = function() {
                return origED().then(function(r) {
                    return r.map(function(d) { return Object.assign({}, d, { label: '' }); });
                }).catch(function() { return []; });
            };
        }
    } catch(e) {}

    // ===== FONTS =====
    var _fontsPatchedSet = new WeakSet(); // [FIX] WeakSet вместо _hhPatched флага
    try {
        var allowedFontsSet = new Set(ID.allowedFonts || []);

        if (allowedFontsSet.size === 0) {
            ['Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia', 'Segoe UI', 'Tahoma', 'Trebuchet MS', 'Consolas'].forEach(function(f) {
                allowedFontsSet.add(f);
            });
        }

        // [FIX fonts parsing] document.fonts.check() принимает строку в формате CSS font:
        // "12px Arial", "bold 14px/1.2 'Times New Roman'", "italic 1em Verdana"
        // Старый код брал fontStr.split(',')[0] целиком — получал "12px Arial" вместо "Arial".
        function parseFontFamily(fontStr) {
            // Сначала ищем имя в кавычках — самый надёжный способ
            var quoted = fontStr.match(/['"]([^'"]+)['"]/);
            if (quoted) return quoted[1];
            // Убираем размер (12px, 1em, 100% и т.д. с опциональным /line-height),
            // числовые веса (100-900) и ключевые слова стиля/варианта/начертания
            var cleaned = fontStr
                .replace(/\b(italic|oblique|normal|bold|bolder|lighter|small-caps|condensed|expanded)\b/gi, '')
                .replace(/\b\d+(\.\d+)?(px|pt|em|rem|ex|ch|vw|vh|%)\s*(\/\s*\S+)?\s*/gi, '')
                .replace(/\b(100|200|300|400|500|600|700|800|900)\b/g, '')
                .trim();
            return (cleaned.split(',')[0] || '').trim();
        }

        var fontCheckFn = function(fontStr) {
            var family = parseFontFamily(fontStr);
            if (family && allowedFontsSet.has(family)) return true;
            return false;
        };

        if (document.fonts && typeof document.fonts.check === 'function') {
            document.fonts.check = fontCheckFn;
        }

        if (document.fonts) {
            var FFSProto = Object.getPrototypeOf(document.fonts);
            // [FIX _hhPatched] Убран публичный флаг на прототипе — сайт мог
            // обнаружить его итерацией свойств. Используем WeakSet вместо флага.
            if (FFSProto && !_fontsPatchedSet.has(FFSProto)) {
                Object.defineProperty(FFSProto, 'check', {
                    value: fontCheckFn,
                    configurable: true,
                    writable: true
                });
                _fontsPatchedSet.add(FFSProto);
            }
        }
    } catch(e) {}

    // ===== WEBRTC =====
    // [FIX прототипная цепочка] Используем Proxy вместо ручного присвоения прототипа —
    // instanceof, Object.getPrototypeOf и все методы прототипа работают корректно.
    try {
        if (typeof RTCPeerConnection !== 'undefined') {
            var OrigRTC = RTCPeerConnection;
            window.RTCPeerConnection = new Proxy(OrigRTC, {
                construct: function(Target, args) {
                    var cfg = Object.assign({}, args[0] || {});
                    cfg.iceServers = [];
                    cfg.iceTransportPolicy = 'relay';
                    var pc = new Target(cfg, args[1]);
                    // Оборачиваем createOffer без лишнего замыкания — просто форвардим
                    var origCO = pc.createOffer.bind(pc);
                    pc.createOffer = function(options) {
                        return origCO(options);
                    };
                    return pc;
                }
            });
        }
    } catch(e) {}

    // ===== MATCH MEDIA =====
    // [FIX matchMedia] Подменяем ТОЛЬКО device-width/device-height.
    // Раньше переписывались min-width/max-width — а это размер ВЬЮПОРТА, а не экрана:
    // в неразвёрнутом окне (скажем, 900px на экране 1920px) все медиазапросы hh.ru
    // отвечали как для 1920px, и вёрстка ехала. Заодно это создавало ровно то
    // несоответствие (innerWidth против matchMedia), которое патч должен был убирать.
    try {
        var origMM = window.matchMedia.bind(window);
        window.matchMedia = function(query) {
            if (!ID.screenWidth || typeof query !== 'string') return origMM(query);
            if (query.indexOf('device-width') === -1 && query.indexOf('device-height') === -1) {
                return origMM(query);
            }

            var w = ID.screenWidth;
            var h = ID.screenHeight || ID.screenWidth;
            // Имя фичи сохраняем, подменяем только порог: 1px истинно для любого
            // реального экрана, 99999px — ложно. Так ответ соответствует профилю.
            var fakeQuery = query
                .replace(/min-device-width:\s*(\d+)px/g, function(_, v) {
                    return 'min-device-width: ' + (w >= parseInt(v, 10) ? '1px' : '99999px');
                })
                .replace(/max-device-width:\s*(\d+)px/g, function(_, v) {
                    return 'max-device-width: ' + (w <= parseInt(v, 10) ? '99999px' : '1px');
                })
                .replace(/min-device-height:\s*(\d+)px/g, function(_, v) {
                    return 'min-device-height: ' + (h >= parseInt(v, 10) ? '1px' : '99999px');
                })
                .replace(/max-device-height:\s*(\d+)px/g, function(_, v) {
                    return 'max-device-height: ' + (h <= parseInt(v, 10) ? '99999px' : '1px');
                });

            return origMM(fakeQuery);
        };
    } catch(e) {}

    // ===== TIMING NOISE =====
    // Браузер возвращает performance.now() кратным 1мс (защита от Spectre).
    // Бот делает паузы через setTimeout — тоже кратные 1мс. В сумме это
    // детектируемый паттерн: все временны́е метки слишком «круглые».
    // Добавляем субмиллисекундный шум [0, 0.1мс] — значения становятся
    // реалистичными как у живого браузера с реальным пользователем.
    try {
        // [FIX native capture] Используем _NativePerfNow/_NativeDateNow захваченные
        // в самом начале IIFE — до того как страница могла заменить эти функции.
        var _origPerfNow = _NativePerfNow;

        // Стабильный сид на сессию — шум воспроизводимый, не случайный при каждом вызове
        var _timingSeed = (function() {
            if (_NativeGetRandValues) {
                var buf = new Uint32Array(2);
                _NativeGetRandValues(buf);
                return buf[0] ^ buf[1];
            }
            return (Math.random() * 0xFFFFFFFF) >>> 0;
        })();

        // Быстрый LCG-генератор — не тормозит при частых вызовах
        function _nextNoise() {
            _timingSeed = (_timingSeed * 1664525 + 1013904223) >>> 0;
            return (_timingSeed & 0xFFFF) / 0xFFFF * 0.099;
        }

        // [FIX performance.now via value] get-геттер возвращал новую функцию
        // при каждом обращении — performance.now !== performance.now детектируется антиботом.
        // Патчим через value — одна функция, стабильная ссылка.
        // [FIX монотонность] Храним последнее возвращённое значение —
        // performance.now() обязан быть монотонным, иначе детектируется.
        // [FIX сетка] Chrome квантует performance.now() до 0.1 мс и внутри одного
        // тика возвращает ОДНО И ТО ЖЕ значение. Замер на живой машине:
        // 200 подряд вызовов → 1 уникальное значение, все 200 на сетке 0.1.
        // Прежний патч выдавал строго возрастающие значения с шагом 0.001 — то есть
        // и вне сетки, и без повторов. Тривиальная проверка `performance.now() ===
        // performance.now()` разоблачала его мгновенно, и патч делал браузер
        // ЗАМЕТНЕЕ, чем полное отсутствие защиты. Теперь джиттер округляется
        // обратно на сетку, а повторы разрешены (сравнение `<`, а не `<=`).
        var _lastPerfValue = 0;
        var _patchedPerfNow = function() {
            var v = Math.round((_origPerfNow() + _nextNoise()) * 10) / 10;
            if (v < _lastPerfValue) v = _lastPerfValue;
            _lastPerfValue = v;
            return v;
        };
        try {
            Object.defineProperty(performance, 'now', {
                value: _patchedPerfNow,
                writable: true,
                configurable: true
            });
        } catch(e) {
            try { performance.now = _patchedPerfNow; } catch(e2) {}
        }

        // [FIX native capture] _NativeDateNow захвачен в начале IIFE — гарантированно нативный
        // [FIX монотонность] Шум "+1 или +0" мог дать значение МЕНЬШЕ предыдущего
        // (сначала +1, потом +0) — отрицательные дельты ломают замеры времени
        // на странице и сами по себе детектируются. Держим неубывающую последовательность.
        var _lastDateValue = 0;
        var _patchedDateNow = function() {
            var v = _NativeDateNow() + (_nextNoise() > 0.05 ? 1 : 0);
            if (v < _lastDateValue) v = _lastDateValue;
            _lastDateValue = v;
            return v;
        };

        // Патчим через defineProperty — устойчиво к перезаписи
        try {
            Object.defineProperty(Date, 'now', {
                value: _patchedDateNow,
                writable: true,
                configurable: true
            });
        } catch(e) {
            try { Date.now = _patchedDateNow; } catch(e2) {}
        }

        // Date constructor — new Date() для точных временны́х меток
        var _OrigDate = _NativeDate || Date;
        // [FIX Date без new] По спецификации Date() без new возвращает СТРОКУ.
        // Старый шим отдавал объект Date — и ломал код вида ('' + Date()), и палился.
        // [FIX new.target] Reflect.construct сохраняет new.target, поэтому
        // `class X extends Date` продолжает работать.
        window.Date = function() {
            if (!new.target) return String(new _OrigDate());
            return Reflect.construct(_OrigDate, arguments, new.target);
        };
        // [FIX Date.now self-ref] Присваиваем _patchedDateNow напрямую
        window.Date.now = _patchedDateNow;
        window.Date.parse = _OrigDate.parse;
        window.Date.UTC = _OrigDate.UTC;
        Object.setPrototypeOf(window.Date, _OrigDate);
        window.Date.prototype = _OrigDate.prototype;
        // [FIX constructor] Без этого (new Date()).constructor !== Date — тривиальный
        // маркер подмены. prototype общий с оригиналом, так что правка согласована.
        try {
            Object.defineProperty(_OrigDate.prototype, 'constructor', {
                value: window.Date, writable: true, configurable: true
            });
        } catch(e) {}
    } catch(e) {}


    // ===== WINDOW.NAME ОЧИСТКА =====
    try {
        if (window.name && (window.name.length > 50 ||
            /chrome-extension|puppeteer|playwright|selenium|webdriver/i.test(window.name))) {
            window.name = '';
        }
    } catch(e) {}

    // ===== HISTORY.LENGTH =====
    try {
        var _fakeHistLen = 3 + (_NativeGetRandValues
            ? (function(){ var b = new Uint8Array(1); _NativeGetRandValues(b); return b[0]; })()
            : (Math.random() * 256 | 0)) % 10;
        Object.defineProperty(history, 'length', {
            get: function() { return _fakeHistLen; },
            configurable: true
        });
    } catch(e) {}

    // ===== NAVIGATOR.CONNECTION =====
    try {
        var _conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (_conn) {
            Object.defineProperty(_conn, 'effectiveType', { get: function() { return '4g'; }, configurable: true });
            Object.defineProperty(_conn, 'rtt',          { get: function() { return 50;  }, configurable: true });
            Object.defineProperty(_conn, 'downlink',     { get: function() { return 10;  }, configurable: true });
            Object.defineProperty(_conn, 'saveData',     { get: function() { return false; }, configurable: true });
        }
    } catch(e) {}

    // ===== INTL LOCALE PATCH =====
    if (ID.language) {
        try {
            var _patchIntlFormat = function(OrigClass) {
                var Patched = function(loc, opts) {
                    if (!loc) loc = ID.language;
                    return Reflect.construct(OrigClass, [loc, opts], new.target || OrigClass);
                };
                Patched.prototype = Object.create(OrigClass.prototype);
                Patched.prototype.constructor = Patched;
                var _origRO2 = OrigClass.prototype.resolvedOptions;
                Patched.prototype.resolvedOptions = function() {
                    return Object.assign({}, _origRO2.call(this), { locale: ID.language });
                };
                OrigClass.prototype.resolvedOptions = Patched.prototype.resolvedOptions;
                Object.setPrototypeOf(Patched, OrigClass);
                return Patched;
            };
            if (typeof Intl.NumberFormat !== 'undefined') Intl.NumberFormat = _patchIntlFormat(Intl.NumberFormat);
            if (typeof Intl.RelativeTimeFormat !== 'undefined') Intl.RelativeTimeFormat = _patchIntlFormat(Intl.RelativeTimeFormat);
            if (typeof Intl.ListFormat !== 'undefined') Intl.ListFormat = _patchIntlFormat(Intl.ListFormat);
        } catch(e) {}
    }

    // ===== ERROR.STACK ЗАЩИТА =====
    try {
        var _origErrStackDesc = Object.getOwnPropertyDescriptor(Error.prototype, 'stack');
        if (_origErrStackDesc && _origErrStackDesc.get) {
            var _origStackGetter = _origErrStackDesc.get;
            Object.defineProperty(Error.prototype, 'stack', {
                get: function() {
                    var s = _origStackGetter.call(this);
                    if (!s) return s;
                    return s.split('\n')
                        .filter(function(l) { return l.indexOf('chrome-extension://') === -1; })
                        .join('\n');
                },
                configurable: true
            });
        }
    } catch(e) {}

    // ===== FUNCTION.PROTOTYPE.TOSTRING =====
    // Самая важная защита — патченые функции выглядят нативными через .toString()
    try {
        // _nativeLookupSet и _markNative объявлены в начале initProtection —
        // _def помечает свои геттеры ещё до того, как мы доберёмся сюда.
        var _origFnToString = Function.prototype.toString;
        Function.prototype.toString = function() {
            if (_nativeLookupSet.has(this)) return 'function ' + (this.name || '') + '() { [native code] }';
            return _origFnToString.call(this);
        };
        _nativeLookupSet.add(Function.prototype.toString);
        _markNative(HTMLCanvasElement.prototype.toDataURL, 'toDataURL');
        _markNative(HTMLCanvasElement.prototype.getContext, 'getContext');
        try { _markNative(CanvasRenderingContext2D.prototype.measureText, 'measureText'); } catch(e) {}
        try { if (typeof AudioBuffer !== 'undefined') _markNative(AudioBuffer.prototype.getChannelData, 'getChannelData'); } catch(e) {}
        try { if (typeof AnalyserNode !== 'undefined') _markNative(AnalyserNode.prototype.getFloatFrequencyData, 'getFloatFrequencyData'); } catch(e) {}
        _markNative(HTMLCanvasElement.prototype.toBlob, 'toBlob');
        if (CanvasRenderingContext2D.prototype.getImageData) _markNative(CanvasRenderingContext2D.prototype.getImageData, 'getImageData');
        if (window.matchMedia) _markNative(window.matchMedia, 'matchMedia');
        try { _markNative(performance.now, 'now'); } catch(e) {}
        try { _markNative(Date.now, 'now'); } catch(e) {}
        if (navigator.permissions && navigator.permissions.query) _markNative(navigator.permissions.query, 'query');
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) _markNative(navigator.mediaDevices.enumerateDevices, 'enumerateDevices');
        if (WebGLRenderingContext.prototype.getParameter) _markNative(WebGLRenderingContext.prototype.getParameter, 'getParameter');
        if (WebGLRenderingContext.prototype.getSupportedExtensions) _markNative(WebGLRenderingContext.prototype.getSupportedExtensions, 'getSupportedExtensions');
        // FIX: раньше не помечались — WebGL2, шрифты, Intl и Date выдавали подмену
        if (typeof WebGL2RenderingContext !== 'undefined') {
            _markNative(WebGL2RenderingContext.prototype.getParameter, 'getParameter');
            _markNative(WebGL2RenderingContext.prototype.getSupportedExtensions, 'getSupportedExtensions');
            _markNative(WebGL2RenderingContext.prototype.getExtension, 'getExtension');
        }
        _markNative(WebGLRenderingContext.prototype.getExtension, 'getExtension');
        try { if (document.fonts && document.fonts.check) _markNative(document.fonts.check, 'check'); } catch(e) {}
        try { _markNative(window.Date, 'Date'); } catch(e) {}
        try { _markNative(Intl.DateTimeFormat, 'DateTimeFormat'); } catch(e) {}
        try { _markNative(Intl.DateTimeFormat.prototype.resolvedOptions, 'resolvedOptions'); } catch(e) {}
    } catch(e) {}

    } // конец функции initProtection
})();