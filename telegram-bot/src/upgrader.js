const config = require('./config');

/**
 * Perform Spotify account upgrade at upgrader.cc.
 * 
 * @param {string} key The product/upgrade key
 * @param {string} email Spotify account email
 * @param {string} password Spotify account password
 * @returns {Promise<{ success: boolean, message: string, spotifyAccountId?: string }>} Result details
 */
async function upgradeAccount(key, email, password) {
  if (config.useMockApi) {
    console.log(`[MOCK API] Upgrading account: Key=${key}, Email=${email}`);
    // Simulate error cases for testing
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
    const res = await fetch(`${config.upgraderApiUrl}/api/upgrade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.upgraderApiKey
      },
      body: JSON.stringify({
        key,
        login: email,
        password
      })
    });

    const data = await res.json();
    
    // Upgrader.cc standard response fields: success (boolean), message (string)
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
 * This dissociates the account and prepares the key to be used again.
 * 
 * @param {string} key The product/upgrade key
 * @param {string} email Spotify account email
 * @param {string} password Spotify account password (if available)
 * @returns {Promise<{ success: boolean, message: string }>} Result details
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
    const res = await fetch(`${config.upgraderApiUrl}/api/renew`, {
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
 * 
 * @param {string} key The product/upgrade key
 * @returns {Promise<{ status: string, message?: string }>} Status details (e.g. status: 'usable')
 */
async function getKeyInfo(key) {
  if (config.useMockApi) {
    console.log(`[MOCK API] Checking key status: ${key}`);
    // Check if it is marked as error or expired in local simulation
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
    // Info endpoint is GET /API/?info={key}
    const res = await fetch(`${config.upgraderApiUrl}/API/?info=${key}`, {
      method: 'GET',
      headers: {
        'X-API-Key': config.upgraderApiKey
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    // Typical keys: {"status": "usable"} or {"status": "active"} or similar
    return {
      status: data.status || 'unknown',
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
