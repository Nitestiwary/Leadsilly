// Background Service Worker

const BACKEND_URL = 'http://localhost:5000';

// Listen to message calls
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'authenticate_user') {
    // 1. Google OAuth Authentication using Identity API
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError || !token) {
        console.error('OAuth Token failed:', chrome.runtime.lastError);
        // Fallback mock token for local developer mode
        const mockRes = await fetch(`${BACKEND_URL}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken: 'mock_token',
            mockUser: {
              email: 'niteshkumar@leadsilly.com',
              name: 'Nitesh Kumar',
              avatarUrl: 'https://lh3.googleusercontent.com/a/default-user'
            }
          })
        });
        const mockData = await mockRes.json();
        sendResponse({ success: true, token: mockData.token, user: mockData.user });
        return;
      }

      try {
        // Authenticate with actual google ID token
        const response = await fetch(`${BACKEND_URL}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token })
        });
        const data = await response.json();
        sendResponse({ success: true, token: data.token, user: data.user });
      } catch (err: any) {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true; // Keep response channel open
  }

  if (request.action === 'capture_screenshot') {
    // 2. Tab Screen Capture (Required for Agency Screenshot feature)
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
    // 3. Post lead data to backend Express API
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
});
