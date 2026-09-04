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
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    let random = (buf[0] / 0xFFFFFFFF) * totalWeight;
    for (const gpu of GPU_VARIANTS) {
        if (random < gpu.weight) return { webglVendor: gpu.vendor, webglRenderer: gpu.renderer };
        random -= gpu.weight;
    }
    return { webglVendor: GPU_VARIANTS[0].vendor, webglRenderer: GPU_VARIANTS[0].renderer };
}

let DEFAULT_PROFILE = null;
let initializationPromise = null;

// [FIX дублирование] Профиль собирался двумя почти одинаковыми литералами —
// основным и fallback'ом в catch. Они уже разъехались: в fallback'е clientHints
// был пустым объектом, из-за чего hh-protect.js не патчил navigator.userAgentData
// и Client Hints противоречили подменённому User-Agent. Теперь сборка одна.
function buildProfile(selectedGPU) {
    return {
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
        webglParams: {
            0x0D33: 16384, 0x8B4D: 16, 0x8B49: 16, 0x8872: 16,
            0x8B4C: 16, 0x8869: 16, 0x851C: 16384, 0x8B2A: 1024,
            0x8A2B: 1024, 0x88FF: 8, 0x8073: 4096, 0x84E8: 16,
            0x0B45: 2, 0x9111: 4,
        },
        allowedFonts: [
            'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS',
            'Consolas', 'Courier New', 'Georgia', 'Impact', 'Lucida Console',
            'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe UI', 'Tahoma',
            'Times New Roman', 'Trebuchet MS', 'Verdana', 'Wingdings'
        ],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
        appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
        clientHints: {
            brands: [{ brand: 'Chromium', version: '148' }, { brand: 'Google Chrome', version: '148' }, { brand: 'Not/A)Brand', version: '99' }],
            platform: 'Windows',
            mobile: false,
            platformVersion: '10.0.0',
            architecture: 'x86',
            bitness: '64'
        },
        version: '2.4'
    };
}

async function initialize(forceNewGpu) {
    try {
        const result = forceNewGpu ? {} : await chrome.storage.local.get(['hh_selected_gpu']);
        let selectedGPU;

        if (result.hh_selected_gpu && result.hh_selected_gpu.webglVendor) {
            selectedGPU = result.hh_selected_gpu;
            console.log('[BACKGROUND] Загружена сохранённая видеокарта:', selectedGPU.webglRenderer);
        } else {
            selectedGPU = getRandomGPU();
            try {
                await chrome.storage.local.set({ hh_selected_gpu: selectedGPU });
            } catch(e) {
                console.warn('[BACKGROUND] storage save failed:', e);
            }
            console.log('[BACKGROUND] Выбрана новая видеокарта:', selectedGPU.webglRenderer);
        }

        DEFAULT_PROFILE = buildProfile(selectedGPU);
    } catch(e) {
        console.error('[BACKGROUND] Ошибка:', e);
        DEFAULT_PROFILE = buildProfile(getRandomGPU());
    }
}

// [FIX реинициализация] Флаг `initialized` выставлялся ДО завершения initialize(),
// и повторный вызов уже ничего не делал — перевыбрать GPU было невозможно.
// Единственный источник правды теперь — сам промис.
function ensureInitialized(forceNewGpu) {
    if (forceNewGpu || !initializationPromise) initializationPromise = initialize(forceNewGpu);
    return initializationPromise;
}

ensureInitialized();

// [FIX] Обработчик сообщений от content.js
// await initializationPromise — гарантирует что SW полностью инициализирован
// до обработки любого сообщения (актуально при перезапуске SW)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        await ensureInitialized();

        if (request && request.action === 'showNotification') {
            try {
                // [FIX] Уникальный notificationId — без него Chrome схлопывает повторные уведомления
                const notifId = 'hh-bot-' + Date.now();
                await chrome.notifications.create(notifId, {
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: request.title || 'HH Авто-отклик',
                    message: request.message || ''
                });
                // Автоматически скрываем уведомление через 8 секунд
                setTimeout(() => chrome.notifications.clear(notifId).catch(() => {}), 8000);
            } catch(e) {
                console.warn('[BACKGROUND] notification failed:', e.message);
            }
            sendResponse({ ok: true });
            return;
        }

        if (request && request.action === 'checkConnection') {
            sendResponse({ ok: true, profile: !!DEFAULT_PROFILE });
            return;
        }
        // [FIX висящий канал] Раньше на неизвестное действие sendResponse не вызывался
        // вовсе, а слушатель всё равно возвращал true — промис отправителя не
        // резолвился никогда. Отвечаем всегда.
        sendResponse({ ok: false, error: 'unknown action' });
    })();
    return true; // держим канал открытым для async sendResponse
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        if (!tab.url || !tab.url.startsWith('http')) return;

        let tabHostname;
        try { tabHostname = new URL(tab.url).hostname; } catch(_) { return; }
        if (tabHostname !== 'hh.ru' && !tabHostname.endsWith('.hh.ru')) return;

        await ensureInitialized();
        if (!DEFAULT_PROFILE) return;

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
            if (msg.includes('No tab with id') || msg.includes('The tab was closed')) return;
            if (msg.includes('Cannot access') || msg.includes('not allowed in incognito')) {
                console.info('[BACKGROUND] inject skipped (incognito/restricted) — tabId:', tabId);
                return;
            }
            console.warn('[BACKGROUND] inject failed — tabId:', tabId, 'url:', tab.url, 'error:', msg);
        });
    }
});

chrome.runtime.onStartup.addListener(() => {
    console.log('[BACKGROUND] onStartup — SW перезапущен');
    ensureInitialized();
});

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // [FIX рассинхрон GPU] Раньше здесь просто удалялся ключ из storage —
        // но initialize() к этому моменту уже успевал выбрать и СОХРАНИТЬ карту,
        // и удаление стирало именно её. В памяти оставалась одна карта, в storage —
        // ничего, и при следующем старте service worker'а профиль менялся сам собой.
        // Теперь перевыбираем карту явно и сразу сохраняем новую.
        console.log('[BACKGROUND] onInstalled fresh install — выбираем новый GPU');
        ensureInitialized(true);
        return;
    }
    // При обновлении GPU сохранён — перевыбор не нужен
    if (details.reason === 'update') console.log('[BACKGROUND] onInstalled update — GPU сохранён');
    ensureInitialized();
});