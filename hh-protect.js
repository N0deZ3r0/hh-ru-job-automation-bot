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
        try {
            Object.defineProperty(Navigator.prototype, 'doNotTrack', {
                get: function() { return '1'; },
                configurable: true
            });
        } catch(e) {}
        try {
            Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {
                get: function() { return 0; },
                configurable: true
            });
        } catch(e) {}
        // [NEW] UA/platform заглушки в окне 0-100мс до загрузки профиля
        try {
            Object.defineProperty(Navigator.prototype, 'userAgent', {
                get: function() { return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'; },
                configurable: true
            });
        } catch(e) {}
        try {
            Object.defineProperty(Navigator.prototype, 'platform', {
                get: function() { return 'Win32'; },
                configurable: true
            });
        } catch(e) {}
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
    try {
        Object.defineProperty(window, 'devicePixelRatio', {
            get: function() { return ID.devicePixelRatio || 1; },
            configurable: true
        });
    } catch(e) {}

    // ===== TIMEZONE =====
    // [FIX Intl.DateTimeFormat] Копируем статические методы и правильно
    // выстраиваем цепочку прототипов через Object.setPrototypeOf.
    if (ID.timezone) {
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

        // FIX: hh-protect.js выполняется в MAIN world, а core.js кладёт __HH_WASM__
        // в ISOLATED world — это РАЗНЫЕ window. Ссылка здесь всегда была null (да ещё
        // и читалась на document_start, до окончания асинхронной загрузки WASM),
        // поэтому шум к canvas не применялся НИКОГДА. Теперь: ищем WASM лениво —
        // на случай, если он появится в MAIN world, — и всегда имеем JS-фолбэк.
        function getWasm() {
            try {
                var w = window.__HH_WASM__;
                return (w && typeof w.addCanvasNoise === 'function') ? w : null;
            } catch(e) { return null; }
        }

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
            if (wasm && wasm.shouldSkipCanvasNoise) {
                try { if (wasm.shouldSkipCanvasNoise(canvas.width, canvas.height)) return false; } catch(e) {}
            } else if (canvas.width * canvas.height > 4194304) {
                // Без WASM-эвристики сами не трогаем гигантские холсты (>4 Мпикс) —
                // это почти всегда реальная графика, а не снятие отпечатка.
                return false;
            }

            try {
                // getContext('2d') вернёт null, если у холста уже есть webgl-контекст
                var ctx = canvas.getContext('2d');
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

    // ===== WEBGL =====
    try {
        var g1 = WebGLRenderingContext.prototype;
        var origGP1 = g1.getParameter;
        g1.getParameter = function(p) {
            if (p === 0x1F00 || p === 0x9245) return ID.webglVendor;
            if (p === 0x1F01 || p === 0x9246) return ID.webglRenderer;
            if (ID.webglParams && ID.webglParams[p] !== undefined) return ID.webglParams[p];
            try { return origGP1.call(this, p); } catch(e) { return null; }
        };

        var origGSE = g1.getSupportedExtensions;
        g1.getSupportedExtensions = function() {
            // FIX: на потерянном контексте нативный метод возвращает null — .filter падал
            var exts = origGSE.call(this);
            if (!exts) return exts;
            return exts.filter(function(e) { return e !== 'WEBGL_debug_renderer_info'; });
        };

        var origGE = g1.getExtension;
        g1.getExtension = function(n) {
            if (n === 'WEBGL_debug_renderer_info') return null;
            return origGE.call(this, n);
        };

        if (typeof WebGL2RenderingContext !== 'undefined') {
            var g2 = WebGL2RenderingContext.prototype;
            var origGP2 = g2.getParameter;
            g2.getParameter = function(p) {
                if (p === 0x1F00 || p === 0x9245) return ID.webglVendor;
                if (p === 0x1F01 || p === 0x9246) return ID.webglRenderer;
                if (ID.webglParams && ID.webglParams[p] !== undefined) return ID.webglParams[p];
                return origGP2.call(this, p);
            };
            var origGSE2 = g2.getSupportedExtensions;
            g2.getSupportedExtensions = function() {
                var exts = origGSE2.call(this);
                if (!exts) return exts;
                return exts.filter(function(e) { return e !== 'WEBGL_debug_renderer_info'; });
            };
            var origGE2 = g2.getExtension;
            g2.getExtension = function(n) {
                if (n === 'WEBGL_debug_renderer_info') return null;
                return origGE2.call(this, n);
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
    try {
        var np = Navigator.prototype;
        if (ID.platform) _def(np, 'platform', ID.platform);
        if (ID.hwConcurrency) _def(np, 'hardwareConcurrency', ID.hwConcurrency);
        if (ID.deviceMemory) _def(np, 'deviceMemory', ID.deviceMemory);
        _def(np, 'webdriver', ID.webdriver);
        if (ID.vendor) _def(np, 'vendor', ID.vendor);
        if (ID.language) _def(np, 'language', ID.language);
        if (ID.languages) _def(np, 'languages', ID.languages);
        if (ID.userAgent) {
            _def(np, 'userAgent', ID.userAgent);
            // [FIX appVersion] Приоритет явному полю из профиля (background.js уже формирует
            // его корректно без "Mozilla/"). Fallback — вычисление на месте.
            _def(np, 'appVersion', ID.appVersion || ID.userAgent.replace(/^Mozilla\//, ''));
        }
        _def(np, 'maxTouchPoints', 0);
        _def(np, 'doNotTrack', '1');
        _def(np, 'pdfViewerEnabled', true);

        // [FIX лишний аргумент] Убран 4-й аргумент false — _def принимает только 3
        try { _def(np, 'bluetooth', undefined); } catch(e) {}
        try { _def(np, 'usb', undefined); } catch(e) {}
        try { _def(np, 'serial', undefined); } catch(e) {}
        try { _def(np, 'hid', undefined); } catch(e) {}
    } catch(e) {}

    // ===== CLIENT HINTS =====
    try {
        var uad = navigator.userAgentData;
        if (uad && ID.clientHints) {
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
        var _lastPerfValue = 0;
        var _patchedPerfNow = function() {
            var v = _origPerfNow() + _nextNoise();
            if (v <= _lastPerfValue) v = _lastPerfValue + 0.001;
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