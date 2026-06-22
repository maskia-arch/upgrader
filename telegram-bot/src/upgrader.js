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
    console.log(`[MOCK API] Upgrading account: Key=${key}, Email=${email}`);
    if (password.toLowerCase().startsWith('fail')) {
      return {
        success: false,
        message: 'Invalid Spotify password or credentials mismatch (Simulated)'
      };
    }
    if (email.toLowerCase().includes('error')) {
      return {
        success: false,
        message: 'Upgrader.cc internal API error (Simulated)'
      };
    }
    return {
      success: true,
      message: 'Account successfully upgraded to premium (Simulated)',
      spotifyAccountId: `mock_spotify_acc_${Math.floor(Math.random() * 1000000)}`
    };
  }

  try {
    const res = await fetch(getApiEndpoint('upgrade'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.upgraderApiKey
      },
      body: JSON.stringify({
        key,
        login: email,
        password,
        country: 'ANY'
      })
    });

    const data = await res.json();
    if (res.ok && data && (data.success || data.status === 'success')) {
      return {
        success: true,
        message: data.message || 'Upgrade successful',
        spotifyAccountId: data.account_id || data.spotify_account_id || null
      };
    }

    return {
      success: false,
      message: (data && data.message) || `Upgrader API failed with status ${res.status}`
    };
  } catch (error) {
    console.error('[API ERROR] Failed to upgrade account at Upgrader.cc:', error.message);
    return {
      success: false,
      message: `Network/API connection error: ${error.message}`
    };
  }
}

/**
 * Trigger renewal/release process for an account at upgrader.cc.
 */
async function renewAccount(key, email, password = '') {
  if (config.useMockApi) {
    console.log(`[MOCK API] Initiating renewal for key: ${key}, Email: ${email}`);
    if (email.toLowerCase().includes('still_active') || (password && password.toLowerCase().includes('still_active'))) {
      return {
        success: false,
        message: 'premium still active'
      };
    }
    return {
      success: true,
      message: 'Renewal / replacement process initiated successfully (Simulated)'
    };
  }

  try {
    const res = await fetch(getApiEndpoint('renew'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.upgraderApiKey
      },
      body: JSON.stringify({
        key,
        login: email,
        password: password || undefined
      })
    });

    const data = await res.json();
    if (res.ok && data && (data.success || data.status === 'success')) {
      return {
        success: true,
        message: data.message || 'Renewal initiated'
      };
    }

    return {
      success: false,
      message: (data && data.message) || `Upgrader API failed with status ${res.status}`
    };
  } catch (error) {
    console.error('[API ERROR] Failed to renew account at Upgrader.cc:', error.message);
    return {
      success: false,
      message: `Network/API connection error: ${error.message}`
    };
  }
}

/**
 * Retrieve key status details from upgrader.cc.
 */
async function getKeyInfo(key) {
  if (config.useMockApi) {
    console.log(`[MOCK API] Checking key status: ${key}`);
    if (key.includes('error')) {
      return { status: 'error', message: 'Simulated key error' };
    }
    if (key.includes('expired')) {
      return { status: 'expired', message: 'Simulated key expiration' };
    }
    return {
      status: 'usable',
      message: 'Key is usable (Simulated)'
    };
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

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

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
    console.error(`[API ERROR] Failed to fetch key info for ${key}:`, error.message);
    return {
      status: 'error',
      message: error.message
    };
  }
}

module.exports = {
  upgradeAccount,
  renewAccount,
  getKeyInfo,
};
