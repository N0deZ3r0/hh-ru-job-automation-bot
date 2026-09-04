// ===== PROTECT.JS — загрузчик protect.wasm =====
//
// Раньше здесь лежал клей эмскриптена на 30 КБ: своя куча, malloc/free,
// UTF8-хелперы, обработка выхода из main и ещё двадцать функций рантайма,
// из которых расширение пользовалось четырьмя. Новый protect.wasm собран
// из wasm/protect.wat, не имеет ни одного импорта и не требует аллокатора:
// JS кладёт данные в его память по фиксированному смещению и при
// необходимости растит её сам.
//
// Файл грузится в двух мирах:
//   ISOLATED — обычным content script'ом, отсюда его берёт core.js;
//   MAIN     — hh-protect.js забирает его через fetch и выполняет внутри
//              new Function, чтобы объявление ниже не стало свойством
//              window и не выдало расширение странице.
var HHProtectWasm = (function () {
    'use strict';

    // Первый килобайт памяти модуля зарезервирован, рабочая область идёт следом.
    // Смещение кратно 4 — иначе не создать Float32Array/Int32Array поверх буфера.
    var SCRATCH = 1024;

    function wrap(instance) {
        var e = instance.exports;
        var mem = e.memory;
        var enc = new TextEncoder();

        // Память растёт страницами по 64 КБ. Все представления создаются
        // ПОСЛЕ вызова, потому что grow отсоединяет старый ArrayBuffer.
        function ensure(bytes) {
            var need = SCRATCH + bytes;
            var have = mem.buffer.byteLength;
            if (have < need) mem.grow(Math.ceil((need - have) / 65536));
        }

        return {
            shouldNoiseCanvas: function (w, h) {
                return e.should_noise_canvas(w, h) === 1;
            },

            canvasNoise: function (imageData) {
                var px = imageData.data, len = px.length;
                if (!len) return false;
                ensure(len);
                new Uint8Array(mem.buffer, SCRATCH, len).set(px);
                e.canvas_noise(SCRATCH, len);
                px.set(new Uint8Array(mem.buffer, SCRATCH, len));
                return true;
            },

            textWidth: function (width, text) {
                var b = enc.encode(String(text));
                ensure(b.length);
                if (b.length) new Uint8Array(mem.buffer, SCRATCH, b.length).set(b);
                var out = e.text_width(width, SCRATCH, b.length);
                return (typeof out === 'number' && isFinite(out)) ? out : width;
            },

            audioNoise: function (samples, intensity) {
                var n = samples.length;
                if (!n) return false;
                ensure(n * 4);
                new Float32Array(mem.buffer, SCRATCH, n).set(samples);
                e.audio_noise(SCRATCH, n, intensity);
                samples.set(new Float32Array(mem.buffer, SCRATCH, n));
                return true;
            },

            shaderPrecision: function (precisionType) {
                ensure(12);
                e.shader_precision(precisionType, SCRATCH);
                var v = new Int32Array(mem.buffer, SCRATCH, 3);
                return { rangeMin: v[0], rangeMax: v[1], precision: v[2] };
            },

            maxAnisotropy: function () { return e.max_anisotropy(); },

            randomInt: function (max) { return e.random_int(max); }
        };
    }

    // wasmUrl — абсолютный адрес protect.wasm. В ISOLATED world его даёт
    // chrome.runtime.getURL, в MAIN world он приходит в профиле от background.js.
    async function load(wasmUrl, seedPair) {
        var instance;
        try {
            // instantiateStreaming требует Content-Type application/wasm;
            // если сервер отдаёт другой тип — падаем в обычную загрузку.
            var streamed = await WebAssembly.instantiateStreaming(fetch(wasmUrl), {});
            instance = streamed.instance;
        } catch (e) {
            var bytes = await (await fetch(wasmUrl)).arrayBuffer();
            instance = (await WebAssembly.instantiate(bytes, {})).instance;
        }

        // [FIX] Сид приходит СНАРУЖИ и постоянен для установки. Раньше он брался
        // из getRandomValues на каждой загрузке — отпечаток канваса менялся при
        // каждом заходе, что само по себе выдаёт автоматизацию. Случайный сид
        // остаётся лишь аварийным вариантом, если вызывающий его не передал.
        var a, b;
        if (seedPair && typeof seedPair[0] === 'number' && typeof seedPair[1] === 'number') {
            a = seedPair[0] >>> 0; b = seedPair[1] >>> 0;
        } else {
            var s = new Uint32Array(2);
            (typeof crypto !== 'undefined' ? crypto : self.crypto).getRandomValues(s);
            a = s[0]; b = s[1];
        }
        instance.exports.seed(a | 1, b || 0x6D2B79F5);

        return wrap(instance);
    }

    return { load: load };
})();

if (typeof module === 'object' && module.exports) module.exports = HHProtectWasm;
