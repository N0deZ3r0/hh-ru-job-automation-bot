// ===== HH AUTO RESPONDER v2.0 — CORE PROTECTION =====
(function() {
    'use strict';

    // ===== ТИХОЕ ПОДАВЛЕНИЕ ОШИБОК =====
    (function() {
        const oe = console.error, ow = console.warn, ol = console.log;
        const sp = ['ERR_BLOCKED_BY_CLIENT','anatskytics','fingerprint','TargetAds','weborama','skcrtxr','Canvas2D','willReadFrequently','fallbackSharedVendor','notSharedVendors','Minified React error','MessagePort','Network Error','TargetAds_WebSDK','hybrid.ai','dss.hybrid.ai','appsflyer','secureportal','_txspjs'];
        console.error = function(...a) { const m = (a[0]||'').toString(); for (const p of sp) if (m.includes(p)) return; return oe.apply(this,a); };
        console.warn = function(...a) { const m = (a[0]||'').toString(); for (const p of sp) if (m.includes(p)) return; return ow.apply(this,a); };
        console.log = function(...a) { return ol.apply(this,a); };
        window.addEventListener('unhandledrejection', e => { const m = e.reason?.toString()||''; for (const p of sp) if (m.includes(p)) { e.preventDefault(); return false; } });
    })();

    // ===== ОЧИСТКА localStorage =====
    (function() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k.includes('_tads') || k.includes('ss_incoming_params') || k.includes('ss_webReferrer')) keys.push(k);
        }
        keys.forEach(k => localStorage.removeItem(k));
    })();

    // ===== БЛОКИРОВКА ГЛОБАЛЬНЫХ ОБЪЕКТОВ =====
    try { Object.defineProperty(window, '_txspjs', { value: undefined, writable: false, configurable: false }); } catch(e) {}
    try { Object.defineProperty(window, '_txq', { value: [], writable: false, configurable: false }); } catch(e) {}

    // ===== ЗАГРУЗКА WASM =====
    window.__HH_WASM__ = null;
    window.__HH_CORE_READY__ = false;

    (async function() {
        try {
            if (typeof ProtectModule === 'function') {
                console.log('🛡️ Загрузка WASM...');
                const M = await ProtectModule({ locateFile: p => chrome.runtime.getURL(p) });

                const sa = new Uint32Array(64);
                crypto.getRandomValues(sa);
                const sp = M._malloc(64 * 4);
                for (let i = 0; i < 64; i++) M.setValue(sp + i * 4, sa[i], 'i32');
                M._seed_random(sp, 64);
                M._free(sp);

                window.__HH_WASM__ = {
                    shouldBlockUrl(url) {
                        const b = new TextEncoder().encode(url);
                        const p = M._malloc(b.length + 1);
                        for (let i = 0; i < b.length; i++) M.setValue(p + i, b[i], 'i8');
                        M.setValue(p + b.length, 0, 'i8');
                        const r = M._should_block_url(p, b.length);
                        M._free(p);
                        return r === 1;
                    },
                    addCanvasNoise(d) {
                        const px = d.data;
                        const p = M._malloc(px.length);
                        for (let i = 0; i < px.length; i++) M.setValue(p + i, px[i], 'i8');
                        M._add_canvas_noise(p, d.width, d.height, d.width * 4);
                        for (let i = 0; i < px.length; i++) px[i] = M.getValue(p + i, 'i8');
                        M._free(p);
                    },
                    addAudioNoise(s, l) {
                        const p = M._malloc(s.length * 4);
                        for (let i = 0; i < s.length; i++) M.setValue(p + i * 4, s[i], 'float');
                        M._add_audio_noise(p, s.length, l);
                        for (let i = 0; i < s.length; i++) s[i] = M.getValue(p + i * 4, 'float');
                        M._free(p);
                    },
                    getFakeBatteryLevel(r) { return M._get_fake_battery_level(r || -1); },
                    getFakeWebGLVendor() { return M.UTF8ToString(M._get_fake_webgl_vendor()); },
                    getFakeWebGLRenderer() { return M.UTF8ToString(M._get_fake_webgl_renderer()); },
                    getFakeWebGLParam(p) { return M._get_fake_webgl_param(p); },
                    getFakeShaderPrecision() {
                        const rm = M._malloc(8), rM = M._malloc(8), pr = M._malloc(8);
                        M._get_fake_shader_precision(rm, rM, pr);
                        const r = {
                            rangeMin: [M.getValue(rm,'i32'), M.getValue(rm+4,'i32')],
                            rangeMax: [M.getValue(rM,'i32'), M.getValue(rM+4,'i32')],
                            precision: [M.getValue(pr,'i32'), M.getValue(pr+4,'i32')]
                        };
                        M._free(rm); M._free(rM); M._free(pr);
                        return r;
                    },
                    checkCanvasIntegrity() { return M._check_canvas_integrity() !== 0; },
                    getRandomMode() { return M._get_random_mode(); },
                    getRandomInt(max) { return M._get_random_int(max); }
                };
                console.log('✅ WASM активирован:', Object.keys(window.__HH_WASM__).join(', '));
            }
        } catch(e) { console.warn('⚠️ WASM не загружен:', e.message); }
        window.__HH_CORE_READY__ = true;
        window.dispatchEvent(new Event('hh-core-ready'));
    })();

    function getWASM() { return window.__HH_WASM__; }

    function isLocal(url) {
        const W = getWASM();
        if (W && typeof url === 'string') { try { if (W.shouldBlockUrl(url)) return true; } catch(e) {} }
        try {
            const bh = ['127.0.0.1','localhost','::1','0.0.0.0'];
            const bp = ['192.168.','10.','172.16.','172.17.','172.18.','172.19.','172.20.','172.21.','172.22.','172.23.','172.24.','172.25.','172.26.','172.27.','172.28.','172.29.','172.30.','172.31.'];
            const u = new URL(String(url), location.href);
            const h = u.hostname.toLowerCase();
            if (h.includes('hh.ru')) return false;
            if (bh.includes(h)) return true;
            if (bp.some(p => h.startsWith(p))) return true;
            return false;
        } catch { return false; }
    }

    // ===== БЛОКИРОВКА ПОРТОВ =====
    try {
        const origFetch = globalThis.fetch;
        globalThis.fetch = function(url, ...args) {
            if (typeof url === 'string' && url.includes('protect.wasm')) return origFetch.call(globalThis, url, ...args);
            if (isLocal(url)) return Promise.reject(new TypeError("blocked"));
            return origFetch.call(globalThis, url, ...args);
        };
        const oO = XMLHttpRequest.prototype.open, oS = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(m, url, ...a) { this.__url = url; return oO.call(this, m, url, ...a); };
        XMLHttpRequest.prototype.send = function(...a) { if (isLocal(this.__url)) return; return oS.apply(this, a); };
        globalThis.WebSocket = class extends globalThis.WebSocket { constructor(url, p) { if (isLocal(url)) throw new Error("blocked"); super(url, p); } };
        globalThis.EventSource = class extends globalThis.EventSource { constructor(url, o) { if (isLocal(url)) throw new Error("blocked"); super(url, o); } };
        if (navigator.sendBeacon) { const o = navigator.sendBeacon; navigator.sendBeacon = function(url, d) { if (isLocal(url)) return false; return o.call(this, url, d); }; }
    } catch(e) {}

    // ===== БЛОКИРОВКА FINGERPRINT =====
    try {
        const oTD = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(...a) {
            if (this.width < 100 && this.height < 100) {
                const c = this.getContext('2d');
                if (c) {
                    const W = getWASM();
                    if (W) { try { const d = c.getImageData(0,0,this.width,this.height); W.addCanvasNoise(d); c.putImageData(d,0,0); } catch(e) {} }
                    else { c.fillStyle = '#'+Math.floor(Math.random()*16777215).toString(16); c.fillRect(0,0,this.width,this.height); c.fillText(Math.random().toString(36),2,10); }
                }
            }
            return oTD.apply(this, a);
        };
        const oTB = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function(cb, ...a) {
            if (this.width < 100 && this.height < 100) { const c = this.getContext('2d'); if (c) { c.fillStyle = '#'+Math.floor(Math.random()*16777215).toString(16); c.fillRect(0,0,this.width,this.height); } }
            return oTB.call(this, cb, ...a);
        };

        const oGP = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(p) {
            const W = getWASM();
            if (p === 0x1F00) return W ? W.getFakeWebGLVendor() : 'Google Inc.';
            if (p === 0x1F01) return W ? W.getFakeWebGLRenderer() : 'ANGLE (Generic)';
            if (p === 0x0D33 || p === 0x0D2A) return W ? W.getFakeWebGLParam(p) : 4096 + Math.floor(Math.random()*4096);
            return oGP.call(this, p);
        };
        const oGE = WebGLRenderingContext.prototype.getExtension;
        WebGLRenderingContext.prototype.getExtension = function(n) { if (n === 'WEBGL_debug_renderer_info') return null; return oGE.call(this, n); };

        if (typeof AudioContext !== 'undefined') {
            const oCA = AudioContext.prototype.createAnalyser;
            AudioContext.prototype.createAnalyser = function() {
                const a = oCA.call(this);
                const oGF = a.getFloatFrequencyData;
                a.getFloatFrequencyData = function(arr) {
                    oGF.call(this, arr);
                    const W = getWASM();
                    if (W) { try { W.addAudioNoise(arr, 0.001); return; } catch(e) {} }
                    for (let i = 0; i < arr.length; i++) arr[i] += (Math.random()-0.5)*0.1;
                };
                return a;
            };
        }

        if (navigator.getBattery) {
            const oGB = navigator.getBattery.bind(navigator);
            navigator.getBattery = async function() {
                const r = await oGB();
                const W = getWASM();
                if (W) { try { const fl = W.getFakeBatteryLevel(r.level); return new Proxy(r, { get(t,p) { if (p==='level') return fl; return Reflect.get(t,p); } }); } catch(e) {} }
                return r;
            };
        }

        const oSB = navigator.sendBeacon;
        if (oSB) navigator.sendBeacon = function(url, d) { if (typeof url === 'string' && (url.includes('/fingerprint')||url.includes('/anatskytics'))) return false; return oSB.call(this, url, d); };
        const oF = window.fetch;
        window.fetch = function(url, ...a) {
            if (typeof url === 'string') {
                if (url.includes('protect.wasm')) return oF.call(this, url, ...a);
                if (url.includes('/fingerprint')||url.includes('/anatskytics')) return Promise.reject(new TypeError('blocked'));
            }
            return oF.call(this, url, ...a);
        };
    } catch(e) {}

    console.log('=== CORE: Tech Guard active ===');
})();