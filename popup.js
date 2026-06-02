document.addEventListener('DOMContentLoaded', function() {
    updateStatus('✅ Расширение активировано', '🚀');
    checkConnection();
});

function updateStatus(text, icon) {
    var el = document.getElementById('status');
    var ic = document.getElementById('statusIcon');
    if (el) {
        el.textContent = text;
        el.className = 'status-text ' + (text.includes('✅') ? 'status-connected' : 'status-disconnected');
    }
    if (ic) ic.textContent = icon || '🚀';
}

async function checkConnection() {
    try {
        var [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) { updateStatus('🌐 Откройте HH.ru', '🌐'); return; }
        // FIX: было tab.url.includes('hh.ru') — пропускало ?redirect=hh.ru и hh.ru.evil.com
        var tabHostname;
        try { tabHostname = new URL(tab.url).hostname; } catch(e) { updateStatus('🌐 Откройте HH.ru', '🌐'); return; }
        if (tabHostname !== 'hh.ru' && !tabHostname.endsWith('.hh.ru')) {
            updateStatus('🌐 Откройте HH.ru', '🌐');
            return;
        }
        try {
            var response = await chrome.tabs.sendMessage(tab.id, { action: 'checkConnection' });
            updateStatus(response && response.connected ? '✅ Активно' : '⚠️ Обновите страницу', '🚀');
        } catch(e) {
            console.debug('sendMessage error:', e.message);
            updateStatus('⚠️ Обновите страницу', '⚠️');
        }
    } catch(e) {
        updateStatus('❌ Ошибка', '❌');
    }
}

var _checkInterval = setInterval(checkConnection, 30000);
window.addEventListener('unload', function() { clearInterval(_checkInterval); });

document.body.addEventListener('click', function() { checkConnection().catch(console.debug); });