// ===== BACKGROUND.JS — инжект профиля в MAIN WORLD =====
'use strict';

const GPU_VARIANTS = [
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)', weight: 15 },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)', weight: 12 },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0)', weight: 8 },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0)', weight: 10 },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0)', weight: 8 },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0)', weight: 7 },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 7600 Direct3D11 vs_5_0 ps_5_0)', weight: 5 },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)', weight: 20 },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)', weight: 15 }
];

function getRandomGPU() {
    const totalWeight = GPU_VARIANTS.reduce((sum, gpu) => sum + gpu.weight, 0);
    // [FIX crypto.random] Используем криптографически стойкий RNG вместо Math.random()
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    let random = (buf[0] / 0xFFFFFFFF) * totalWeight;
    for (const gpu of GPU_VARIANTS) {
        if (random < gpu.weight) return { webglVendor: gpu.vendor, webglRenderer: gpu.renderer };
        random -= gpu.weight;
    }
    return { webglVendor: GPU_VARIANTS[0].vendor, webglRenderer: GPU_VARIANTS[0].renderer };
}

// ===== ФИКСИРОВАННАЯ ВИДЕОКАРТА (через chrome.storage) =====
let DEFAULT_PROFILE = null;
let initializationPromise = null;
// [FIX двойной запуск] Флаг однократной инициализации — onStartup и onInstalled
// могут сработать одновременно, этот флаг гарантирует что initialize() выполнится лишь раз.
let initialized = false;

async function initialize() {
    // [FIX двойной запуск] Если уже инициализированы — ничего не делаем
    if (initialized) return;
    initialized = true;

    try {
        const result = await chrome.storage.local.get(['hh_selected_gpu']);
        let selectedGPU;
        
        if (result.hh_selected_gpu) {
            selectedGPU = result.hh_selected_gpu;
            console.log('[BACKGROUND] Загружена сохранённая видеокарта:', selectedGPU.webglRenderer);
        } else {
            selectedGPU = getRandomGPU();
            // FIX: добавлена обработка ошибки сохранения — без catch при сбое GPU менялся при каждом перезапуске
            await chrome.storage.local.set({ hh_selected_gpu: selectedGPU }).catch(e => console.warn('[BACKGROUND] storage save failed:', e));
            console.log('[BACKGROUND] Выбрана новая видеокарта:', selectedGPU.webglRenderer);
        }
        
        DEFAULT_PROFILE = {
            platform: 'Win32',
            hwConcurrency: 8,
            deviceMemory: 16,
            vendor: 'Google Inc.',
            language: 'ru-RU',
            languages: ['ru-RU', 'ru'],
            webdriver: false,
            timezone: 'Europe/Moscow',
            screenWidth: 1920,
            screenHeight: 1080,
            devicePixelRatio: 1,
            webglVendor: selectedGPU.webglVendor,
            webglRenderer: selectedGPU.webglRenderer,
            // webglParams: реалистичные параметры для NVIDIA RTX-класса
            // Ключи — значения WebGL-констант которые сайты проверяют чаще всего
            webglParams: {
                0x0D33: 16384,   // MAX_TEXTURE_SIZE
                0x8B4D: 16,      // MAX_VERTEX_UNIFORM_VECTORS
                0x8B49: 16,      // MAX_FRAGMENT_UNIFORM_VECTORS
                0x8872: 16,      // MAX_TEXTURE_IMAGE_UNITS
                0x8B4C: 16,      // MAX_VARYING_VECTORS
                0x8869: 16,      // MAX_VERTEX_ATTRIBS
                0x851C: 16384,   // MAX_CUBE_MAP_TEXTURE_SIZE
                0x8B2A: 1024,    // MAX_VERTEX_UNIFORM_COMPONENTS (WebGL2)
                0x8A2B: 1024,    // MAX_FRAGMENT_UNIFORM_COMPONENTS (WebGL2)
                0x88FF: 8,       // MAX_VERTEX_TEXTURE_IMAGE_UNITS
                0x8073: 4096,    // MAX_RENDERBUFFER_SIZE
                0x84E8: 16,      // MAX_COMBINED_TEXTURE_IMAGE_UNITS
                0x0B45: 2,       // LINE_WIDTH range max
                0x9111: 4,       // MAX_SAMPLES (WebGL2 MSAA)
            },
            allowedFonts: [
                'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS',
                'Consolas', 'Courier New', 'Georgia', 'Impact', 'Lucida Console',
                'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe UI', 'Tahoma',
                'Times New Roman', 'Trebuchet MS', 'Verdana', 'Wingdings'
            ],
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
            // FIX: appVersion отсутствовал — tz-patch.js fallback ставил полный UA с Mozilla/5.0 префиксом что неверно
            appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
            clientHints: {
                brands: [{ brand: 'Chromium', version: '148' }, { brand: 'Google Chrome', version: '148' }, { brand: 'Not/A)Brand', version: '99' }],
                platform: 'Windows',
                mobile: false,
                platformVersion: '10.0.0',
                architecture: 'x86',
                bitness: '64'
            },
            // [FIX version] Передаём версию в профиль — ui.js читает bot.version
            version: '2.2'
        };
        
    } catch(e) {
        console.error('[BACKGROUND] Ошибка:', e);
        // Fallback
        const fallbackGPU = getRandomGPU();
        DEFAULT_PROFILE = {
            platform: 'Win32',
            hwConcurrency: 8,
            deviceMemory: 16,
            vendor: 'Google Inc.',
            language: 'ru-RU',
            languages: ['ru-RU', 'ru'],
            webdriver: false,
            timezone: 'Europe/Moscow',
            screenWidth: 1920,
            screenHeight: 1080,
            devicePixelRatio: 1,
            webglVendor: fallbackGPU.webglVendor,
            webglRenderer: fallbackGPU.webglRenderer,
            webglParams: {
                0x0D33: 16384, 0x8B4D: 16, 0x8B49: 16, 0x8872: 16,
                0x8B4C: 16, 0x8869: 16, 0x851C: 16384, 0x8B2A: 1024,
                0x8A2B: 1024, 0x88FF: 8, 0x8073: 4096, 0x84E8: 16,
                0x0B45: 2, 0x9111: 4,
            },
            allowedFonts: [
                // FIX: было [] — пустой список блокировал все шрифты, детектируемая аномалия
                'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS',
                'Consolas', 'Courier New', 'Georgia', 'Impact', 'Lucida Console',
                'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe UI', 'Tahoma',
                'Times New Roman', 'Trebuchet MS', 'Verdana', 'Wingdings'
            ],
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
            // FIX: appVersion отсутствовал в fallback — аналогично основному профилю
            appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
            clientHints: {},
            version: '2.2'
        };
    }
}

// Запускаем инициализацию
initializationPromise = initialize();

// Инжект профиля при загрузке страницы
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        // [FIX tab.url] Явная проверка до try/catch — отфильтровывает undefined,
        // chrome://, about:blank и прочие не-http(s) URL без лишних исключений
        if (!tab.url || !tab.url.startsWith('http')) return;

        let tabHostname;
        try { tabHostname = new URL(tab.url).hostname; } catch(_) { return; }
        if (tabHostname !== 'hh.ru' && !tabHostname.endsWith('.hh.ru')) return;

        // [FIX SW restart] При перезапуске Service Worker переменные сбрасываются в null.
        // await null выполняется мгновенно, DEFAULT_PROFILE не готов — инжект пропускается.
        // Ленивая инициализация гарантирует что initialize() запущен перед использованием.
        if (!initializationPromise) initializationPromise = initialize();
        await initializationPromise;
        if (!DEFAULT_PROFILE) return;

        // [FIX incognito/PDF] Фильтруем заведомо неудачные кейсы до executeScript,
        // чтобы не генерировать лишние ошибки. PDF проверяем по URL.
        // Инкогнито не блокируем заранее — Chrome сам кинет ошибку если нет разрешения,
        // и мы её аккуратно перехватим ниже (deprecated isAllowedIncognitoAccess не используем).
        if (tab.url.split('?')[0].toLowerCase().endsWith('.pdf')) {
            console.info('[BACKGROUND] skipped PDF tab — tabId:', tabId);
            return;
        }

        chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            injectImmediately: true,
            func: (p) => { window.__HH_PROFILE_DATA__ = p; },
            args: [DEFAULT_PROFILE]
        }).catch(e => {
            const msg = e.message || '';
            // Временные ошибки — вкладка закрылась пока шёл инжект, не логируем
            if (msg.includes('No tab with id') || msg.includes('The tab was closed')) return;
            // Инкогнито без разрешения или системные ограничения — ожидаемо, логируем как info
            if (msg.includes('Cannot access') || msg.includes('not allowed in incognito')) {
                console.info('[BACKGROUND] inject skipped (incognito/restricted) — tabId:', tabId);
                return;
            }
            console.warn('[BACKGROUND] inject failed — tabId:', tabId, 'url:', tab.url, 'error:', msg);
        });
    }
});

// [FIX двойной запуск] onStartup и onInstalled больше не вызывают initialize() напрямую —
// флаг initialized внутри функции гарантирует однократное выполнение.
// Ленивая инициализация в onUpdated покрывает кейс перезапуска SW.
chrome.runtime.onStartup.addListener(() => {
    if (!initializationPromise) initializationPromise = initialize();
});

chrome.runtime.onInstalled.addListener((details) => {
    // При обновлении расширения GPU уже сохранён — реинициализация не нужна
    if (details.reason === 'update') return;
    if (!initializationPromise) initializationPromise = initialize();
});