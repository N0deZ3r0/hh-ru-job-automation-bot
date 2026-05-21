## 🚧 v1.0.0 — РЕЛИЗ

| Компонент | Статус |
|-----------|--------|
| 🧠 WebGL — консоль чистая, подмена GPU | ✅ ГОТОВО |
| 🎲 Видеокарта | Фиксированная: Intel Iris Xe / UHD 630 / NVIDIA RTX 3060/3070 |
| 🌍 Часовой пояс | 70+ стран, DST зима/лето, Computed Location скрыт |
| 🇷🇺 Язык | en-US, настраивается под страну |
| 🔧 WASM-ядро — 28 функций, детерминированный шум | ✅ ГОТОВО |
| 📱 Screen + Window — без out of bounds | ✅ ГОТОВО |
| 🎨 Canvas — шум через JS + WASM | ✅ ГОТОВО |
| 🔊 Audio — шум через WASM | ✅ ГОТОВО |
| 🔤 Fonts — 80+ шрифтов | ✅ ГОТОВО |
| 🌐 Client Hints — полная подмена HTTP + JS | ✅ ГОТОВО |
| 🔒 Navigator — 11 свойств подменены | ✅ ГОТОВО |
| 📋 Permissions — всегда prompt | ✅ ГОТОВО |
| 🔋 Battery — подмена | ✅ ГОТОВО |
| 🎤 Media Devices — скрытие меток | ✅ ГОТОВО |
| 🧬 Прототипы — все native, включая Function.prototype.toString | ✅ ГОТОВО |
| 🔄 SPA-восстановление — pushState/popstate | ✅ ГОТОВО |
| 💾 Сохранение состояния — localStorage | ✅ ГОТОВО |
| 🛡️ Блокировка трекеров — declarativeNetRequest | ✅ ГОТОВО |
| 🔒 Обход CSP — Blob URL для WASM | ✅ ГОТОВО |
| 🧪 CreepJS | ✅ Все проверки пройдены |
| 🧪 Pixelscan | ✅ Чисто |
| 🧪 BrowserLeaks | ✅ Полная подмена |
| 🧪 AmIUnique | ✅ ~3-7% уникальность |
| 🧪 DeviceInfo | ✅ Все параметры подменены |
| 🧪 VK.com | ✅ Работает без ошибок |
| 📦 Релиз | ✅ ГОТОВ |

## 📥 УСТАНОВКА
1. Скачайте репозиторий
2. Откройте chrome://extensions/
3. Включите "Режим разработчика"
4. Нажмите "Загрузить распакованное"
5. Выберите папку с файлами

## 🌟 ОСНОВНЫЕ ФУНКЦИИ
🕐 Часовой пояс — Полная эмуляция с DST (зима/лето) для 70+ стран. Computed Location скрыт через перехват исторических дат.
🎨 Canvas — Внедрение шума (JS + WASM) для скрытия «почерка» GPU. Стабильный хэш между сессиями.
🖥️ WebGL — Подмена вендора и модели видеокарты. Скрытие WEBGL_debug_renderer_info. Фильтрация расширений.
📱 Экран — Подмена screen.width/height, availWidth/Height. Маскировка inner/outer/clientWidth/Height (out of bounds fix).
🔤 Шрифты — Эмуляция 80+ системных шрифтов через document.fonts.check.
🌐 Client Hints — Полная подмена HTTP-заголовков и navigator.userAgentData.
🔒 Navigator — Подмена platform, hwConcurrency, deviceMemory, webdriver, vendor, language, languages, userAgent, maxTouchPoints, doNotTrack, pdfViewerEnabled.
🎤 Медиа-устройства — Скрытие меток микрофонов и камер через enumerateDevices.
🔊 Аудио — Внедрение шума в AudioContext через WASM.
📋 Разрешения — Все запросы возвращают "prompt".
🔋 Батарея — Подмена уровня заряда и статуса зарядки.
🧬 Прототипы — Все подмененные функции проходят проверки на «родной код» (Function.prototype.toString).
⚙️ Попап — Выбор из 4 профилей устройства и 70+ стран.
💾 Сохранение — localStorage, профиль не теряется при перезагрузке.
🔄 SPA-восстановление — Перехват pushState/popstate.

## 🛡️ ЗАЩИТА ОТ ЦИФРОВОГО СЛЕДА
Графический холст (экспорт) — WeakMap-кэш + TTL 2000ms
Графический холст (пиксели) — WASM-шум + JS-шум (детерминированный)
Графический холст (текст) — Микро-шум в альфа-канале
Видеочип (производитель) — Подмена на Google Inc. (Intel/NVIDIA)
Видеочип (модель) — Фиксированная: Intel Iris Xe / RTX 3060 / RTX 3070
Видеочип (параметры) — 12 параметров через webglParams
WEBGL_debug_renderer_info — Скрыто, getExtension возвращает null
Звуковой профиль — AudioContext sampleRate: 48000
Идентификаторы устройств — enumerateDevices → очистка label
Параметры браузера — navigator: 11 свойств подменены
Временные метки — performance.now без подмены
Client Hints — userAgentData: brands Chromium 148, platform Windows, mobile false
WebRTC — Фильтрация приватных IP, перехват onicecandidate
Battery API — Подмена уровня заряда и статуса

## ⚡ БИНАРНЫЙ МОДУЛЬ (WASM)
28 экспортированных функций: _add_canvas_noise, _add_audio_noise, _get_fake_webgl_vendor, _get_fake_webgl_renderer, _get_fake_platform, _get_fake_hardware_concurrency, _get_fake_device_memory, _get_timezone, _get_language, _seed_random, _get_fake_webdriver, _set_locale, _set_locale_from_proxy, _set_audio_graph_params, _should_skip_canvas_noise, _substitute_text_width, _substitute_text_metrics, _normalize_timing, _get_webgl_extensions, _get_webgl_max_anisotropy, _get_fake_screen_width, _get_fake_screen_height, _get_fake_vendor, _get_fake_webgl_param, _get_fake_shader_precision, _should_block_url, _check_canvas_integrity, _get_random_mode, _get_random_int.

Преимущества: Уникальный профиль, стабильность между сессиями, бинарный модуль скрыт от анализа, нативные инструкции, бесшумный fallback при сбоях (JS-патчи работают всегда).

## 🎯 ПАНЕЛЬ УПРАВЛЕНИЯ (ПОПАП)

🎮 Профиль устройства — 4 профиля: Laptop Budget, Laptop Mid, PC Gaming, PC Power
🌍 Страна — 70+ стран
⟳ Применить — Сохранение настроек

## 🔧 ПРОФИЛИ УСТРОЙСТВ

💻 Laptop Budget — 1366×768, 4 cores, 4GB RAM, Intel UHD 630
💻 Laptop Mid — 1920×1080, 8 cores, 8GB RAM, Intel Iris Xe
🎮 PC Gaming — 2560×1440, 12 cores, 32GB RAM, RTX 3070
⚡ PC Power — 3840×2160, 16 cores, 64GB RAM, RTX 3060

## 🏗️ АРХИТЕКТУРА

MAIN WORLD: profile-injector.js → tz-patch.js. Подмена Timezone, Screen, WebGL, Canvas, Navigator, Fonts.
ISOLATED WORLD: protect.js → wasm-loader.js. WASM-шум в Canvas и Audio.
BACKGROUND: background.js. Сборка профиля, хранение настроек, инжект кода.

## 📁 ФАЙЛЫ

manifest.json — Манифест расширения
background.js — Фоновый сервис-воркер
profile-injector.js — Загрузчик профиля (MAIN)
tz-patch.js — Ядро патчей (MAIN)
wasm-loader.js — Загрузчик WASM (ISOLATED)
protect.js — Обёртка Emscripten для WASM
protect.wasm — Скомпилированный WASM модуль
popup.html — Интерфейс расширения
popup.js — Логика попапа
rules.json — Правила HTTP-заголовков
icons/ — Иконки

## ⚠️ ОГРАНИЧЕНИЯ

Web Workers не патчатся — архитектура Chrome
CSS @media device-width не подменяется — уровень браузера
WASM не грузится на сайтах со строгой CSP — JS-патчи работают всегда

## 📊 ДАННЫЕ

Версия: 1.0.0
Браузеры: Chrome, Edge, Brave, Яндекс.Браузер
Защита: 5 рубежей, declarativeNetRequest, 28 WASM-функций
Архитектура: Модульная (background / main / isolated)
Профилей: 4
Стран: 70+
Лицензия: MIT

## 🔄 ИСТОРИЯ

v1.0.0 — Полная подмена Timezone + DST (70+ стран), Screen + Window masking, WebGL vendor/renderer, Canvas noise (JS + WASM), Audio noise (WASM), Fonts (80+ шрифтов), Navigator (11 свойств), Client Hints (HTTP + JS API), Permissions, Battery, Media Devices, Prototype integrity (Function.prototype.toString), chrome.runtime fix, matchMedia device-width/height, localStorage persistence, 4 профиля устройства.

---

Автор: N0deZ3r0 | v1.0.0 🛡️⚡ | MIT

Встроенная защита от сбора цифровых отпечатков.
Сайты больше не собирают данные о вашем компьютере.
