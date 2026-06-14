// Background Service Worker

const BACKEND_URL = 'https://leadsilly.com';

// Listen to message calls
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'capture_screenshot') {
    // 1. Tab Screen Capture (Required for Agency Screenshot feature)
    chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 30 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, dataUrl });
      }
    });
    return true;
  }

  if (request.action === 'save_lead_to_db') {
    // 2. Post lead data to backend Express API
    const { leadData, jwtToken, duplicateOption } = request;
    fetch(`${BACKEND_URL}/api/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({ ...leadData, duplicateOption })
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          sendResponse({ success: false, error: body.error || 'Failed to save lead' });
        } else {
          sendResponse({ success: true, lead: body.lead, status: body.status });
        }
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
  return;
});
