const SUPPORTED_HOSTS = ['hotstar.com', 'jiohotstar.com'];

function isSupportedTab(tab) {
    if (!tab || !tab.id || !tab.url) {
        return false;
    }

    try {
        const parsedUrl = new URL(tab.url);
        const domain = parsedUrl.hostname.split('.').slice(-2).join('.');
        return SUPPORTED_HOSTS.includes(domain);
    } catch (error) {
        return false;
    }
}

chrome.action.onClicked.addListener(async (tab) => {
    if (!isSupportedTab(tab)) {
        return;
    }

    try {
        // Check if content script is already injected
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => !!document.documentElement.dataset.hsSpeedBootedV2
        });

        if (result && result.result) {
            // If already injected, just send toggle message
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => window.dispatchEvent(new CustomEvent('hs-speed-toggle-v2'))
            });
        } else {
            // First time injection
            await chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                files: ['styles.css']
            });

            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
        }
    } catch (error) {
        console.error('Hotstar Pro Speed activation failed:', error);
    }
});
