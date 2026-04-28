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
        if (!tab || !tab.url || !tab.url.includes('hh.ru')) {
            updateStatus('🌐 Откройте HH.ru', '🌐');
            return;
        }
        try {
            var response = await chrome.tabs.sendMessage(tab.id, { action: 'checkConnection' });
            updateStatus(response && response.connected ? '✅ Активно' : '⚠️ Обновите страницу', '🚀');
        } catch(e) {
            updateStatus('⚠️ Обновите страницу', '⚠️');
        }
    } catch(e) {
        updateStatus('❌ Ошибка', '❌');
    }
}

document.body.addEventListener('click', checkConnection);
setInterval(checkConnection, 30000);