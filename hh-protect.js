// ===== HH-PROTECT.JS — MAIN WORLD FINGERPRINT PROTECTION (с WASM Canvas) =====
(function() {
    'use strict';

    // [FIX двойное выполнение] content_scripts и executeScript могут запустить скрипт дважды.
    // Флаг гарантирует что патчи накладываются ровно один раз.
    if (window.__hh_injected__) return;
    window.__hh_injected__ = true;

    var ID = window.__HH_PROFILE_DATA__;

    // [FIX RACE CONDITION] Если профиля нет — применяем заглушки немедленно,
    // а после получения реальных данных перезаписываем их.
    if (!ID) {
        applyStubs();
        setTimeout(function() {
            ID = window.__HH_PROFILE_DATA__;
            if (!ID) {
                return;
            }
            initProtection(ID);
        }, 100);
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
    }

    function initProtection(ID) {

    function _def(obj, prop, value) {
        try {
            Object.defineProperty(obj, prop, {
                get: function() { return value; },
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
            // Копируем статические методы (supportedLocalesOf и др.)
            Object.setPrototypeOf(PatchedDTF, OrigDTF);
            Intl.DateTimeFormat = PatchedDTF;
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

        var wasm = null;
        try {
            wasm = window.__HH_WASM__;
        } catch(e) {}

        // [FIX накопительный шум] Используем offscreen-canvas как буфер:
        // читаем пиксели оригинала через нативный getImageData (не через патч),
        // добавляем шум в копию, записываем копию обратно. Оригинальные данные
        // не мутируются многократно — каждый вызов получает свежую копию.
        function applyCanvasNoise(canvas) {
            if (!wasm || !wasm.addCanvasNoise) return false;
            if (wasm.shouldSkipCanvasNoise && wasm.shouldSkipCanvasNoise(canvas.width, canvas.height)) return false;

            try {
                var ctx = canvas.getContext('2d');
                if (!ctx) return false;
                // Используем сохранённый оригинал — не проходим через патч getImageData
                var imageData = origGID.call(ctx, 0, 0, canvas.width, canvas.height);
                wasm.addCanvasNoise(imageData);
                ctx.putImageData(imageData, 0, 0);
                return true;
            } catch(e) {
                return false;
            }
        }

        HTMLCanvasElement.prototype.toDataURL = function(fmt, q) {
            var now = Date.now();
            // [FIX кеш fmt/q] Ключ кеша включает формат и качество —
            // toDataURL('image/jpeg') и toDataURL('image/png') хранятся раздельно.
            var cacheKey = (fmt || 'image/png') + '|' + (q === undefined ? '' : q);
            var entry = canvasCache.get(this) || {};

            if (entry.urls && entry.urls[cacheKey] && (now - entry.ts < CACHE_TTL)) {
                return entry.urls[cacheKey];
            }

            if (this.width > 0 && this.height > 0) {
                applyCanvasNoise(this);
            }

            var result = origTD.call(this, fmt, q);
            // Сохраняем под составным ключом, не затираем blob и другие форматы
            entry.urls = entry.urls || {};
            entry.urls[cacheKey] = result;
            entry.ts = now;
            canvasCache.set(this, entry);
            return result;
        };

        if (origTB) {
            HTMLCanvasElement.prototype.toBlob = function(callback, fmt, q) {
                var now = Date.now();
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

                if (this.width > 0 && this.height > 0) {
                    applyCanvasNoise(this);
                }

                // [FIX this в колбэке] Сохраняем явную ссылку вместо .bind()
                // [FIX ts timing] Фиксируем время начала вызова, а не завершения колбэка —
                // TTL отсчитывается от одной точки и в toDataURL, и в toBlob.
                var blobStartTime = Date.now();
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
                var seed = (x * 0x9E3779B1 + y * 0xC2B2AE35) ^ (w * 0x27D4EB2F + h * 0x85EBCA6B);
                for (var i = 3; i < data.data.length; i += 4) {
                    seed = (seed * 1664525 + 1013904223) >>> 0;
                    data.data[i] = Math.min(255, Math.max(0, data.data[i] + (seed & 1)));
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
            var exts = origGSE.call(this);
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
            if (FFSProto && !FFSProto._hhPatched) {
                Object.defineProperty(FFSProto, 'check', {
                    value: fontCheckFn,
                    configurable: true,
                    writable: true
                });
                FFSProto._hhPatched = true;
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
    // [FIX matchMedia] Обрабатываем все четыре варианта (min/max × width/height)
    // на основе реальных значений из профиля, а не замены на 9999px.
    // Это устраняет детектируемое несоответствие между screen.width и matchMedia.
    try {
        var origMM = window.matchMedia.bind(window);
        window.matchMedia = function(query) {
            if (!ID.screenWidth) return origMM(query);
            if (!query.includes('width') && !query.includes('height')) return origMM(query);

            var w = ID.screenWidth;
            var h = ID.screenHeight || ID.screenWidth;
            var fakeQuery = query
                .replace(/min-width:\s*(\d+)px/g, function(_, v) {
                    return 'min-width: ' + (w >= parseInt(v) ? '1px' : '99999px');
                })
                .replace(/max-width:\s*(\d+)px/g, function(_, v) {
                    return 'max-width: ' + (w <= parseInt(v) ? '99999px' : '1px');
                })
                .replace(/min-height:\s*(\d+)px/g, function(_, v) {
                    return 'min-height: ' + (h >= parseInt(v) ? '1px' : '99999px');
                })
                .replace(/max-height:\s*(\d+)px/g, function(_, v) {
                    return 'max-height: ' + (h <= parseInt(v) ? '99999px' : '1px');
                });

            return origMM(fakeQuery !== query ? fakeQuery : query);
        };
    } catch(e) {}

    } // конец функции initProtection
})();