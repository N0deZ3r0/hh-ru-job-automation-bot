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

    (async function loadWasm() {
        // [FIX] Модуль больше не эмскриптеновский: protect.js теперь маленький
        // загрузчик, а сам protect.wasm пересобран из wasm/protect.wat.
        let wasmLoadAttempts = 0;
        async function attempt() {
            try {
                if (typeof HHProtectWasm === 'object' && HHProtectWasm && typeof HHProtectWasm.load === 'function') {
                    window.__HH_WASM__ = await HHProtectWasm.load(chrome.runtime.getURL('protect.wasm'));
                    console.debug('[CORE] WASM загружен');
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

    // [FIX] Список трекеров переехал из WASM в JS. В прежнем модуле его держала
    // функция should_block_url, содержимое которой из бинарника было не видно;
    // здесь он совпадает с rules.json, где те же хосты режет declarativeNetRequest.
    // DNR блокирует на сетевом уровне, а эта проверка гасит сам вызов, чтобы
    // страница не получала ERR_BLOCKED_BY_CLIENT и не считала запрос упавшим.
    const BLOCKED_HOSTS = [
        'targetads.io', 'weborama.ru', 'weborama.fr', 'weborama-tech.ru',
        'skcrtxr.com', 'hybrid.ai', 'appsflyer.com', 'top-fwz1.mail.ru',
        'r3.mail.ru', 'mc.yandex.ru', 'counter.yadro.ru', 'cdn.uxfeedback.ru',
        'sdk-api.apptracer.ru', 'stats.vk-portal.net', 'akashi.vk-portal.net',
        'tns-counter.ru', 'ads.adfox.ru'
    ];
    function isBlockedHost(host) {
        for (const b of BLOCKED_HOSTS) {
            if (host === b || host.endsWith('.' + b)) return true;
        }
        return false;
    }

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
        try {
            const u = new URL(String(url), location.href);
            const h = u.hostname.toLowerCase();
            if (isBlockedHost(h)) result = true;
            else if (['127.0.0.1','localhost','::1','0.0.0.0'].includes(h)) result = true;
            else if (h.startsWith('192.168.') || h.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) result = true;
        } catch(e) {}
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

    // Патч Worker удалён: он не мог сработать.
    // Шим включался только при непустом window.__hh_worker_data__, а это поле
    // никто никогда не заполнял — во всём расширении оно только читалось.
    // Событие hh-inject-data, которое шим отправлял внутрь воркера, тоже никто
    // не слушал. Вдобавок core.js живёт в ISOLATED world, поэтому подменённый
    // здесь window.Worker страница вообще не видит: патч действовал лишь на код
    // самого расширения, а оно воркеров не создаёт.
    // Оставалась обёртка вокруг конструктора, которая ничего не делала.
})();