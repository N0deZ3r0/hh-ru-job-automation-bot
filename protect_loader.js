// protect_loader.js - Прокладка для загрузки WASM
(function() {
    // Перехватываем создание WASM до того как protect.js начнет грузить
    var origFetch = window.fetch;
    window.fetch = function(url, options) {
        // Если запрашивают protect.wasm - отдаем из расширения
        if (typeof url === 'string' && url.includes('protect.wasm')) {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                url = chrome.runtime.getURL('protect.wasm');
                console.log('🛡️ Перехвачен запрос WASM:', url);
            }
        }
        return origFetch.call(this, url, options);
    };
    
    console.log('🛡️ WASM loader готов');
})();