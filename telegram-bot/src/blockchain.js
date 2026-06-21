const config = require('./config');

/**
 * Fetch the current spot price of LTC in EUR from Coinbase.
 * @returns {Promise<number>} Exchange rate (EUR per LTC)
 */
async function fetchLtcPrice() {
  if (config.useMockApi) {
    // In mock mode, return a stable mock exchange rate
    return 75.50;
  }
  
  try {
    const res = await fetch('https://api.coinbase.com/v2/prices/LTC-EUR/spot');
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    if (data && data.data && data.data.amount) {
      const rate = parseFloat(data.data.amount);
      if (isNaN(rate) || rate <= 0) {
        throw new Error(`Invalid price value: ${data.data.amount}`);
      }
      return rate;
    }
    throw new Error('Unexpected API response structure');
  } catch (error) {
    console.error('[BLOCKCHAIN ERROR] Failed to fetch LTC price:', error.message);
    throw error;
  }
}

/**
 * Check transactions for a specific Litecoin address.
 * Matches incoming outputs against target amount in LTC (converted to satoshis/litoshis).
 * Returns transaction details if found.
 * 
 * @param {string} address The LTC address to scan
 * @param {number} targetLtc Amount in LTC (e.g. 0.051234)
 * @returns {Promise<{ found: boolean, confirmed: boolean, txHash: string|null }>} Payment status
 */
async function checkPayment(address, targetLtc) {
  if (config.useMockApi) {
    // In mock mode, we look for a local mock database or return unconfirmed/confirmed based on simulation flags.
    // By default, let's allow simulating via database state, or return no transaction.
    return { found: false, confirmed: false, txHash: null };
  }

  try {
    // Esplora endpoint returns the last 25-50 transactions
    const res = await fetch(`https://litecoin.space/api/address/${address}/txs`);
    if (res.status === 404) {
      // 404 means no transactions have ever been sent to this address yet
      return { found: false, confirmed: false, txHash: null };
    }
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const txs = await res.json();
    if (!Array.isArray(txs)) {
      return { found: false, confirmed: false, txHash: null };
    }

    // Convert target LTC to Litoshis (1 LTC = 100,000,000 litoshis)
    const targetLitoshi = Math.round(targetLtc * 100000000);

    for (const tx of txs) {
      if (!tx.vout || !Array.isArray(tx.vout)) continue;

      // Find an output to our target address with matching amount
      const matchingOutput = tx.vout.find(output => 
        output.scriptpubkey_address === address && 
        output.value === targetLitoshi
      );

      if (matchingOutput) {
        const isConfirmed = tx.status && tx.status.confirmed === true;
        return {
          found: true,
          confirmed: isConfirmed,
          txHash: tx.txid
        };
      }
    }

    return { found: false, confirmed: false, txHash: null };
  } catch (error) {
    console.error(`[BLOCKCHAIN ERROR] Failed checking address ${address}:`, error.message);
    throw error;
  }
}

module.exports = {
  fetchLtcPrice,
  checkPayment,
};
