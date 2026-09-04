// ===== CORE.JS v2.4 — WASM + СЕТЕВАЯ ЗАЩИТА + CANVAS NOISE =====
(function() {
    'use strict';

    // [FIX native] Захватываем нативный Date.now до любых патчей страницы или hh-protect.js —
    // core.js грузится в ISOLATED world, но Date.now в ISOLATED и MAIN — разные объекты,
    // поэтому патч из hh-protect.js нас не затрагивает. Захват для ясности и надёжности.
    const _nativeDateNow = (typeof Date !== 'undefined' && typeof Date.now === 'function')
        ? Date.now.bind(Date)
        : function() { return +new Date(); };

    const CONFIG = {
        URL_CACHE_TTL: 60000,
        BLOCK_CACHE_MAX: 200,
        WASM_MAX_ATTEMPTS: 3
    };

    window.__hh_bot_instance__ = null;

    function tryRestoreBot() {
        if (!window.hhAutoResponder && window.__hh_bot_instance__) {
            window.hhAutoResponder = window.__hh_bot_instance__;
            window.__hh_bot_instance__.updateStatus?.('Бот восстановлен');
        }
    }
    window.__hh_tryRestoreBot = tryRestoreBot;

    // SPA-перехват
    let navigationTimeout;
    const blockUrlCache = new Map();

    function handleNavigation() {
        clearTimeout(navigationTimeout);
        blockUrlCache.clear();
        navigationTimeout = setTimeout(tryRestoreBot, 500);
    }

    const origPushState = history.pushState;
    history.pushState = function(...args) {
        const result = origPushState.apply(this, args);
        handleNavigation();
        return result;
    };

    const origReplaceState = history.replaceState;
    history.replaceState = function(...args) {
        const result = origReplaceState.apply(this, args);
        // [FIX replaceState] Вызываем handleNavigation() как в pushState —
        // иначе blockUrlCache не очищался при SPA-навигации через replaceState
        handleNavigation();
        return result;
    };

    window.addEventListener('popstate', handleNavigation);

    // Тихая очистка ошибок
    (function() {
        const oe = console.error, ow = console.warn;
        const sp = ['ERR_BLOCKED_BY_CLIENT','anatskytics','TargetAds','weborama','skcrtxr',
            'Canvas2D','willReadFrequently','fallbackSharedVendor','notSharedVendors',
            'Minified React error','MessagePort','TargetAds_WebSDK','hybrid.ai',
            'dss.hybrid.ai','appsflyer','secureportal','_txspjs','INVALID_ENUM'];
        console.error = function(...a) {
            // FIX: объединяем все аргументы — ранее проверялся только a[0], ошибки в a[1]+ проходили
            const m = a.map(x => (x || '').toString()).join(' ');
            for (const p of sp) if (m.includes(p)) return;
            return oe.apply(this, a);
        };
        console.warn = function(...a) {
            const m = a.map(x => (x || '').toString()).join(' ');
            for (const p of sp) if (m.includes(p)) return;
            return ow.apply(this, a);
        };
        window.addEventListener('unhandledrejection', e => {
            const m = e.reason?.toString() || '';
            for (const p of sp) if (m.includes(p)) { e.preventDefault(); return false; }
        });
    })();

    // Загрузка WASM
    window.__HH_WASM__ = null;
    window.__HH_CORE_READY__ = false;

    const _enc = new TextEncoder();

    function createWASMWrapper(M) {
        function safeMalloc(size) {
            const ptr = M._malloc(size);
            if (!ptr) throw new Error('WASM malloc failed for ' + size + ' bytes');
            return ptr;
        }
        
        return {
            // FIX: убран _M: M — экспонировал сырой WASM снаружи, нигде не использовался
            
            // ===== CANVAS NOISE (WASM) =====
            addCanvasNoise(imageData) {
                const px = imageData.data, len = px.length;
                if (!len) return;
                const p = safeMalloc(len);
                try {
                    // Быстрый путь через HEAPU8 — одно копирование вместо len вызовов setValue.
                    // Heap перечитываем после вызова: WASM мог вырастить память.
                    let heap = M.HEAPU8;
                    if (heap && heap.length >= p + len) {
                        heap.set(px, p);
                        M._add_canvas_noise(p, imageData.width, imageData.height, imageData.width * 4, len);
                        heap = M.HEAPU8;
                        px.set(heap.subarray(p, p + len));
                    } else {
                        for (let i = 0; i < len; i++) M.setValue(p + i, px[i], 'i8');
                        M._add_canvas_noise(p, imageData.width, imageData.height, imageData.width * 4, len);
                        for (let i = 0; i < len; i++) px[i] = M.getValue(p + i, 'i8') & 0xFF;
                    }
                } finally {
                    M._free(p);
                }
            },
            shouldSkipCanvasNoise(w, h) { return M._should_skip_canvas_noise(w, h); },
            
            // ===== WEBGL =====
            getFakeWebGLVendor() { return M.UTF8ToString(M._get_fake_webgl_vendor()); },
            getFakeWebGLRenderer() { return M.UTF8ToString(M._get_fake_webgl_renderer()); },
            getFakeWebGLParam(p) { return M._get_fake_webgl_param(p); },
            getWebGLExtensions() {
                const base = M._get_webgl_extensions();
                if (!base) return [];
                const result = [];
                let offset = 0;
                while (offset < 64) {
                    const ptr = M.getValue(base + offset * 4, '*');
                    if (!ptr) break;
                    result.push(M.UTF8ToString(ptr));
                    offset++;
                }
                return result;
            },
            getWebGLMaxAnisotropy() { return M._get_webgl_max_anisotropy(); },
            
            // ===== NAVIGATOR / SYSTEM =====
            getFakePlatform() { return M.UTF8ToString(M._get_fake_platform()); },
            getFakeHardwareConcurrency() { return M._get_fake_hardware_concurrency(); },
            getFakeDeviceMemory() { return M._get_fake_device_memory(); },
            getFakeVendor() { return M.UTF8ToString(M._get_fake_vendor()); },
            getFakeWebdriver() { return M._get_fake_webdriver(); },
            getFakeScreenWidth() { return M._get_fake_screen_width(); },
            getFakeScreenHeight() { return M._get_fake_screen_height(); },
            
            // ===== LOCALE =====
            getTimezone() { return M.UTF8ToString(M._get_timezone()); },
            getLanguage() { return M.UTF8ToString(M._get_language()); },
            
            // ===== NETWORK =====
            shouldBlockUrl(url) {
                const b = _enc.encode(url);
                const p = safeMalloc(b.length + 1);
                try {
                    for (let i = 0; i < b.length; i++) M.setValue(p + i, b[i], 'i8');
                    M.setValue(p + b.length, 0, 'i8');
                    return M._should_block_url(p, b.length) === 1;
                } finally { M._free(p); }
            }
        };
    }

    (async function loadWasm() {
        // [FIX WASM retry] Счётчик локальный — не утекает в глобальное состояние
        let wasmLoadAttempts = 0;
        async function attempt() {
            try {
                if (typeof ProtectModule === 'function') {
                    const M = await ProtectModule({
                        locateFile: p => chrome.runtime.getURL(p)
                    });

                    // Инициализация seed для детерминированного шума
                    const sa = new Uint32Array(8);
                    crypto.getRandomValues(sa);
                    const sp = M._malloc(8 * 4);
                    if (sp) {
                        try {
                            for (let i = 0; i < 8; i++) M.setValue(sp + i * 4, sa[i], 'i32');
                            M._seed_random(sp, 8);
                        } finally {
                            M._free(sp);
                        }
                    }

                    window.__HH_WASM__ = createWASMWrapper(M);
                    console.debug('[CORE] WASM загружен, Canvas noise доступен');
                }
            } catch(e) {
                wasmLoadAttempts++;
                if (wasmLoadAttempts < CONFIG.WASM_MAX_ATTEMPTS) {
                    setTimeout(attempt, 1000 * wasmLoadAttempts);
                    return;
                }
                console.warn('[CORE] WASM не загружен, работаем в JS режиме');
            }
            window.__HH_CORE_READY__ = true;
            window.dispatchEvent(new Event('hh-core-ready'));
        }
        attempt().catch(e => console.warn('[CORE] loadWasm unhandled:', e));
    })();

    // Сетевая блокировка
    function isLocal(url) {
        if (typeof url !== 'string') return false;
        try {
            const quickHost = new URL(url, location.href).hostname.toLowerCase();
            // [FIX data:/blob:] Пустой hostname → data:, blob:, javascript: URL — не блокируем
            if (!quickHost) return false;
            if (quickHost === 'hh.ru' || quickHost.endsWith('.hh.ru')) return false;
        } catch(e) {
            // FIX: невалидный URL ранее возвращал false (безопасен) — теперь блокируем
            return true;
        }
        
        const cached = blockUrlCache.get(url);
        const now = _nativeDateNow();
        if (cached && (now - cached.timestamp < CONFIG.URL_CACHE_TTL)) return cached.result;
        if (blockUrlCache.size >= CONFIG.BLOCK_CACHE_MAX) {
            const oldest = blockUrlCache.keys().next().value;
            if (oldest) blockUrlCache.delete(oldest);
        }
        let result = false;
        const W = window.__HH_WASM__;
        if (W) { try { result = !!W.shouldBlockUrl(url); } catch(e) {} }
        if (!result) {
            try {
                const u = new URL(String(url), location.href);
                const h = u.hostname.toLowerCase();
                if (['127.0.0.1','localhost','::1','0.0.0.0'].includes(h)) result = true;
                else if (h.startsWith('192.168.') || h.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) result = true;
            } catch(e) {}
        }
        blockUrlCache.set(url, { result, timestamp: now });
        return result;
    }

    // Блокировка сетевых API
    try {
        const origFetch = globalThis.fetch;
        globalThis.fetch = function(url, ...args) {
            const urlStr = url instanceof Request ? url.url : String(url);
            if (isLocal(urlStr)) return Promise.reject(new TypeError('blocked'));
            return origFetch.call(globalThis, url, ...args);
        };
        const oO = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(m, url, ...a) {
            // FIX: url может быть объектом URL — isLocal() отбрасывал не-строки и пропускал запрос
            this.__hh_url = (url === null || url === undefined) ? url : String(url);
            return oO.call(this, m, url, ...a);
        };
        const oS = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(...a) {
            if (isLocal(this.__hh_url)) return;
            const r = oS.apply(this, a);
            // FIX: очищаем __hh_url после send — без этого свойство оставалось на объекте навсегда
            this.__hh_url = null;
            return r;
        };
        const OrigWebSocket = globalThis.WebSocket;
        // [FIX WebSocket Proxy] Используем Proxy — instanceof и прототипная цепочка корректны.
        // [FIX WebSocket constants] Константы (CONNECTING/OPEN/CLOSING/CLOSED) НЕ присваиваем:
        // у нативного WebSocket они non-writable, и присваивание в strict mode бросало
        // TypeError — весь try-блок обрывался, EventSource и sendBeacon оставались без защиты.
        // Proxy и так форвардит чтение этих констант на оригинал.
        globalThis.WebSocket = new Proxy(OrigWebSocket, {
            construct(Target, args) {
                const [url, protocols] = args;
                if (isLocal(url)) throw new Error('blocked');
                return protocols !== undefined
                    ? new Target(url, protocols)
                    : new Target(url);
            }
        });
        const OrigEventSource = globalThis.EventSource;
        // [FIX EventSource Proxy] Используем Proxy — instanceof и прототипная цепочка корректны
        globalThis.EventSource = new Proxy(OrigEventSource, {
            construct(Target, args) {
                const [url, config] = args;
                if (isLocal(url)) throw new Error('blocked');
                return config !== undefined ? new Target(url, config) : new Target(url);
            }
        });
        if (navigator.sendBeacon) {
            const o = navigator.sendBeacon;
            navigator.sendBeacon = function(url, d) { if (isLocal(url)) return false; return o.call(this, url, d); };
        }
    } catch(e) {}

    // WebRTC защита
    // FIX: раньше includes('10.') совпадал с любым адресом, содержащим "10." (1.2.10.3,
    // 93.110.4.1 и т.д.) — легитимные кандидаты выбрасывались; а диапазон 172.16-31
    // покрывался только для 172.16. Теперь адреса вырезаются из SDP и проверяются целиком.
    const PRIVATE_V4 = /^(?:10\.|127\.|0\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
    function isPrivateCandidate(cand) {
        if (!cand || typeof cand !== 'string') return false;
        const ips = cand.match(/(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f]*:[0-9a-f:]+/gi) || [];
        for (const ip of ips) {
            if (ip.indexOf(':') === -1) { if (PRIVATE_V4.test(ip)) return true; continue; }
            const low = ip.toLowerCase();
            if (low === '::1' || low === '::' || low.startsWith('fe80:') ||
                /^f[cd][0-9a-f]{2}:/.test(low)) return true;
        }
        return false;
    }
    // [FIX RTCPeerConnection instanceof] Используем Proxy вместо ручной подстановки прототипа —
    // instanceof, Object.getPrototypeOf и статические свойства работают корректно.
    try {
        const origRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
        if (origRTC) {
            window.RTCPeerConnection = new Proxy(origRTC, {
                construct(Target, args) {
                    const config = args[0];
                    const pc = new Target(config);
                    const origAEL = pc.addEventListener.bind(pc);
                    pc.addEventListener = function(type, listener, options) {
                        if (type === 'icecandidate') {
                            const filtered = function(e) {
                                if (e.candidate && isPrivateCandidate(e.candidate.candidate)) return;
                                return listener.call(this, e);
                            };
                            return origAEL(type, filtered, options);
                        }
                        return origAEL(type, listener, options);
                    };
                    let _oic = null;
                    let _oicWrapped = null;
                    Object.defineProperty(pc, 'onicecandidate', {
                        get: () => _oic,
                        set: (handler) => {
                            if (_oicWrapped) {
                                try { pc.removeEventListener('icecandidate', _oicWrapped); } catch(_) {}
                                _oicWrapped = null;
                            }
                            _oic = handler;
                            if (typeof handler === 'function') {
                                _oicWrapped = function(e) {
                                    if (e.candidate && isPrivateCandidate(e.candidate.candidate)) return;
                                    handler.call(pc, e);
                                };
                                origAEL('icecandidate', _oicWrapped);
                            }
                        },
                        configurable: true
                    });
                    return pc;
                }
            });
            if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = window.RTCPeerConnection;
        }
    } catch(e) {}

    // Worker защита
    try {
        const OrigWorker = window.Worker;
        if (OrigWorker) {
            window.Worker = function(url, options) {
                const payload = window.__hh_worker_data__;
                // FIX: если инжектить нечего — не трогаем воркер вообще. Раньше шим
                // заворачивал в blob: любой воркер, ломая self.location и относительные
                // importScripts, при том что payload всегда был пустым.
                if (!payload || typeof payload !== 'object' || !Object.keys(payload).length) {
                    return new OrigWorker(url, options);
                }
                // module-воркеры не умеют importScripts — шим к ним неприменим
                if (options && options.type === 'module') return new OrigWorker(url, options);

                const urlStr = (url instanceof URL) ? url.href : String(url);
                // FIX race condition: старый шим ждал данных от main-потока через
                // addEventListener('message', ..., {once:true}). Первое же postMessage
                // страницы срабатывало на этот слушатель, он снимался — и importScripts
                // не вызывался никогда, воркер оставался пустым. Плюс служебное
                // 'hh-ready' прилетало в onmessage самой страницы. Теперь данные вшиты
                // в код шима, а исходный скрипт грузится синхронно при старте воркера.
                const shimCode = [
                    'self.__hh_worker_data__ = ' + JSON.stringify(payload) + ';',
                    'try {',
                    '  self.dispatchEvent(new CustomEvent("hh-inject-data", { detail: self.__hh_worker_data__ }));',
                    '} catch(_) {}',
                    'importScripts(' + JSON.stringify(urlStr) + ');'
                ].join('\n');
                const blob = new Blob([shimCode], { type: 'application/javascript' });
                const blobUrl = URL.createObjectURL(blob);
                let worker;
                try {
                    worker = new OrigWorker(blobUrl, options);
                } catch(e) {
                    URL.revokeObjectURL(blobUrl);
                    return new OrigWorker(url, options);
                }
                // Скрипт уже забран конструктором — blob отзываем сразу, без
                // setTimeout(1000), который держал память и создавал гонку.
                URL.revokeObjectURL(blobUrl);
                return worker;
            };
            // [FIX Worker Proxy] Прототипная цепочка через Object.setPrototypeOf —
            // instanceof Worker работает корректно
            Object.setPrototypeOf(window.Worker, OrigWorker);
            window.Worker.prototype = OrigWorker.prototype;
        }
    } catch(e) {}
})();