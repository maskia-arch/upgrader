const config = require('./config');

/**
 * Helper to normalize upgrader.cc endpoint URLs.
 * Handles cases where UPGRADER_API_URL has /api appended or trailing slashes,
 * and always points to the correct /api/path.
 */
function getApiEndpoint(path) {
  let baseUrl = config.upgraderApiUrl || 'https://upgrader.cc';
  // Remove /api or /api/ if it exists at the end, and strip trailing slash
  baseUrl = baseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
  return `${baseUrl}/api/${path.replace(/^\//, '')}`;
}

/**
 * Perform Spotify account upgrade at upgrader.cc.
 */
async function upgradeAccount(key, email, password) {
  if (config.useMockApi) {
    if (password.toLowerCase().startsWith('fail')) {
      return { success: false, message: 'Invalid Spotify credentials (Simulated)' };
    }
    return { success: true, message: 'Upgrade successful (Simulated)', spotifyAccountId: 'mock-acc-id' };
  }

  try {
    const res = await fetch(getApiEndpoint('upgrade'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.upgraderApiKey
      },
      body: JSON.stringify({ key, login: email, password, country: 'ANY' })
    });

    const data = await res.json();
    if (res.ok && data && (data.success || data.status === 'success')) {
      return {
        success: true,
        message: data.message || 'Upgrade successful',
        spotifyAccountId: data.account_id || data.spotify_account_id || null
      };
    }
    return { success: false, message: (data && data.message) || `Failed with status ${res.status}` };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Retrieve key status details from upgrader.cc.
 */
async function getKeyInfo(key) {
  if (config.useMockApi) {
    if (key.includes('error')) return { status: 'error', message: 'Simulated error' };
    return { status: 'usable', message: 'Usable' };
  }

  try {
    const res = await fetch(getApiEndpoint('info'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.upgraderApiKey
      },
      body: JSON.stringify({ key })
    });

    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    
    // Robustly map upgrader.cc statuses to system constraints: ['usable', 'active', 'expired', 'error']
    let status = 'error';
    const msg = (data.message || '').toLowerCase();
    const apiStatus = (data.status || '').toLowerCase();
    
    if (data.used === 0 || data.used === '0' || msg.includes('usable')) {
      status = 'usable';
    } else if (data.used === 1 || data.used === '1') {
      if (apiStatus === 'expired' || msg.includes('expired')) {
        status = 'expired';
      } else {
        status = 'active';
      }
    } else if (apiStatus === 'not_exist' || apiStatus === 'error') {
      status = 'error';
    }

    return {
      status,
      message: data.message || null
    };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

module.exports = {
  upgradeAccount,
  getKeyInfo,
};
