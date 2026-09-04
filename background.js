// ===== BACKGROUND.JS — инжект профиля в MAIN WORLD =====
'use strict';

// [FIX формат ANGLE] Замерено в Chrome 152 на живой машине:
//   ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)
// Прежние строки шли без PCI-идентификатора и без суффикса ", D3D11" — такой формат
// современный Chrome не выдаёт вообще, то есть подменённый рендерер сам себя выдавал.
const GPU_VARIANTS = [
    { family: 'NVIDIA', device: 'NVIDIA GeForce RTX 3060',      pci: '0x00002504', weight: 15 },
    { family: 'NVIDIA', device: 'NVIDIA GeForce RTX 3070',      pci: '0x00002484', weight: 12 },
    { family: 'NVIDIA', device: 'NVIDIA GeForce RTX 3080',      pci: '0x00002206', weight: 8 },
    { family: 'NVIDIA', device: 'NVIDIA GeForce RTX 4060',      pci: '0x00002882', weight: 10 },
    { family: 'AMD',    device: 'AMD Radeon RX 6700 XT',        pci: '0x000073DF', weight: 8 },
    { family: 'AMD',    device: 'AMD Radeon RX 6800 XT',        pci: '0x000073BF', weight: 7 },
    { family: 'AMD',    device: 'AMD Radeon RX 7600',           pci: '0x00007480', weight: 5 },
    { family: 'Intel',  device: 'Intel(R) Iris(R) Xe Graphics', pci: '0x00009A49', weight: 20 },
    { family: 'Intel',  device: 'Intel(R) UHD Graphics 630',    pci: '0x00003E92', weight: 15 }
];

function angleString(v) {
    return 'ANGLE (' + v.family + ', ' + v.device + ' (' + v.pci + ') Direct3D11 vs_5_0 ps_5_0, D3D11)';
}

function getRandomGPU() {
    const totalWeight = GPU_VARIANTS.reduce((sum, gpu) => sum + gpu.weight, 0);
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    let random = (buf[0] / 0xFFFFFFFF) * totalWeight;
    let chosen = GPU_VARIANTS[0];
    for (const gpu of GPU_VARIANTS) {
        if (random < gpu.weight) { chosen = gpu; break; }
        random -= gpu.weight;
    }
    return {
        webglVendor: 'Google Inc. (' + chosen.family + ')',
        webglRenderer: angleString(chosen)
    };
}

let DEFAULT_PROFILE = null;
let initializationPromise = null;

// [FIX рассогласование с заголовками] Раньше профиль был зашит константами:
// Chrome/148, ru-RU, Europe/Moscow, 16 ГБ, 1920x1080, platformVersion 10.0.0.
// Расширение при этом НЕ трогает исходящие заголовки — сервер видит настоящие
// User-Agent, Sec-CH-UA и Accept-Language. Замер на живой машине: браузер
// Chrome 152, локаль et-EE, зона Europe/Tallinn, память 8 ГБ, экран 2008x1255.
// То есть каждое поле противоречило либо самому браузеру, либо его же заголовкам —
// такой набор не выдаёт ни одна настоящая машина, и «защита» работала маркером.
// Теперь всё, что сервер способен перепроверить, берётся у реального браузера,
// а подменяется только то, что заголовками не видно: видеокарта и шум канваса.
async function collectRealEnvironment() {
    const env = {
        userAgent: navigator.userAgent,
        appVersion: String(navigator.userAgent).replace(/^Mozilla\//, ''),
        platform: navigator.platform,
        hwConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory,
        language: navigator.language,
        languages: Array.from(navigator.languages || []),
        timezone: null,
        clientHints: null
    };
    try { env.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch(e) {}
    try {
        if (navigator.userAgentData) {
            const hev = await navigator.userAgentData.getHighEntropyValues([
                'platformVersion', 'architecture', 'bitness', 'uaFullVersion', 'fullVersionList', 'model', 'wow64'
            ]);
            env.clientHints = {
                brands: navigator.userAgentData.brands,
                platform: navigator.userAgentData.platform,
                mobile: navigator.userAgentData.mobile,
                platformVersion: hev.platformVersion,
                architecture: hev.architecture,
                bitness: hev.bitness,
                uaFullVersion: hev.uaFullVersion,
                fullVersionList: hev.fullVersionList,
                model: hev.model,
                wow64: hev.wow64
            };
        }
    } catch(e) {}
    return env;
}

function buildProfile(selectedGPU, env) {
    return {
        // Подменяем только то, чего нет в заголовках запроса
        webdriver: false,
        vendor: 'Google Inc.',
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

        // Зеркалим реальный браузер. hh-protect.js сравнивает эти значения с
        // фактическими и НЕ ставит патч там, где подменять нечего — так меньше
        // патченых геттеров и меньше поводов для детекта.
        userAgent: env.userAgent,
        appVersion: env.appVersion,
        platform: env.platform,
        hwConcurrency: env.hwConcurrency,
        deviceMemory: env.deviceMemory,
        language: env.language,
        languages: env.languages,
        timezone: env.timezone,
        clientHints: env.clientHints || {},

        // screenWidth/screenHeight/devicePixelRatio намеренно ОТСУТСТВУЮТ.
        // Зашитые 1920x1080 были меньше реального окна (outerWidth 2008),
        // а outerWidth > screen.width физически невозможен — это был прямой маркер.
        // hh-protect.js пропускает патчи экрана, когда полей нет.

        version: '2.4'
    };
}

async function initialize(forceNewGpu) {
    let env;
    try {
        env = await collectRealEnvironment();
    } catch(e) {
        console.error('[BACKGROUND] Не удалось прочитать окружение:', e);
        env = { userAgent: navigator.userAgent, appVersion: '', platform: undefined,
                hwConcurrency: undefined, deviceMemory: undefined, language: undefined,
                languages: [], timezone: null, clientHints: null };
    }
    try {
        const result = forceNewGpu ? {} : await chrome.storage.local.get(['hh_selected_gpu']);
        let selectedGPU;

        if (result.hh_selected_gpu && result.hh_selected_gpu.webglVendor &&
            / \(0x[0-9A-Fa-f]{8}\) /.test(result.hh_selected_gpu.webglRenderer || '')) {
            // Сохранённая карта в старом формате (без PCI-id) перевыбирается,
            // иначе на диске навсегда осталась бы палевная строка.
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

        DEFAULT_PROFILE = buildProfile(selectedGPU, env);
    } catch(e) {
        console.error('[BACKGROUND] Ошибка:', e);
        DEFAULT_PROFILE = buildProfile(getRandomGPU(), env);
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