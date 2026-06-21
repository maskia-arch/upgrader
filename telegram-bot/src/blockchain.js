const config = require('./config');

/**
 * Fetch the current spot price of LTC in EUR from Coinbase with fallbacks.
 * @returns {Promise<number>} Exchange rate (EUR per LTC)
 */
async function fetchLtcPrice() {
  if (config.useMockApi) {
    return 75.50;
  }
  
  // Try Coinbase
  try {
    const res = await fetch('https://api.coinbase.com/v2/prices/LTC-EUR/spot');
    if (res.ok) {
      const data = await res.json();
      if (data && data.data && data.data.amount) {
        const rate = parseFloat(data.data.amount);
        if (!isNaN(rate) && rate > 0) return rate;
      }
    }
  } catch (error) {
    console.warn('[BLOCKCHAIN WARNING] Failed to fetch LTC price from Coinbase:', error.message);
  }

  // Fallback: Binance symbol ticker
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=LTCEUR');
    if (res.ok) {
      const data = await res.json();
      if (data && data.price) {
        const rate = parseFloat(data.price);
        if (!isNaN(rate) && rate > 0) return rate;
      }
    }
  } catch (error) {
    console.warn('[BLOCKCHAIN WARNING] Failed to fetch LTC price from Binance:', error.message);
  }

  // Fallback: Coingecko simple price
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=eur');
    if (res.ok) {
      const data = await res.json();
      if (data && data.litecoin && data.litecoin.eur) {
        const rate = parseFloat(data.litecoin.eur);
        if (!isNaN(rate) && rate > 0) return rate;
      }
    }
  } catch (error) {
    console.warn('[BLOCKCHAIN WARNING] Failed to fetch LTC price from Coingecko:', error.message);
  }

  throw new Error('Failed to fetch LTC price from all exchange price feeds.');
}

/**
 * Check transactions for a specific Litecoin address.
 * Matches incoming outputs against target amount in LTC (converted to satoshis/litoshis).
 * Employs automatic fallback across three free explorer APIs.
 * 
 * @param {string} address The LTC address to scan
 * @param {number} targetLtc Amount in LTC (e.g. 0.051234)
 * @returns {Promise<{ found: boolean, confirmed: boolean, txHash: string|null }>} Payment status
 */
async function checkPayment(address, targetLtc) {
  if (config.useMockApi) {
    return { found: false, confirmed: false, txHash: null };
  }

  const targetLitoshi = Math.round(targetLtc * 100000000);
  console.log(`[BLOCKCHAIN] Checking payment for address ${address}, target: ${targetLtc} LTC (${targetLitoshi} litoshis)`);

  // Explorer 1: litecoin.space (Esplora)
  try {
    const res = await fetch(`https://litecoin.space/api/address/${address}/txs`);
    if (res.status === 404) {
      return { found: false, confirmed: false, txHash: null };
    }
    if (res.ok) {
      const txs = await res.json();
      if (Array.isArray(txs)) {
        for (const tx of txs) {
          if (!tx.vout || !Array.isArray(tx.vout)) continue;
          const matchingOutput = tx.vout.find(output => 
            output.scriptpubkey_address === address && 
            output.value === targetLitoshi
          );
          if (matchingOutput) {
            return {
              found: true,
              confirmed: tx.status && tx.status.confirmed === true,
              txHash: tx.txid
            };
          }
        }
        return { found: false, confirmed: false, txHash: null };
      }
    } else {
      console.warn(`[BLOCKCHAIN WARNING] litecoin.space returned status ${res.status}. Trying fallback explorer...`);
    }
  } catch (err) {
    console.warn(`[BLOCKCHAIN WARNING] litecoin.space fetch failed: ${err.message}. Trying fallback explorer...`);
  }

  // Explorer 2: Chain.so (v2 API)
  try {
    const res = await fetch(`https://chain.so/api/v2/get_tx_received/LTC/${address}`);
    if (res.ok) {
      const body = await res.json();
      if (body && body.status === 'success' && body.data && Array.isArray(body.data.txs)) {
        for (const tx of body.data.txs) {
          const valLitoshi = Math.round(parseFloat(tx.value) * 100000000);
          if (valLitoshi === targetLitoshi) {
            return {
              found: true,
              confirmed: tx.confirmations && tx.confirmations >= 1,
              txHash: tx.txid
            };
          }
        }
        return { found: false, confirmed: false, txHash: null };
      }
    } else {
      console.warn(`[BLOCKCHAIN WARNING] chain.so returned status ${res.status}. Trying second fallback...`);
    }
  } catch (err) {
    console.warn(`[BLOCKCHAIN WARNING] chain.so fetch failed: ${err.message}. Trying second fallback...`);
  }

  // Explorer 3: BlockCypher (LTC API)
  try {
    const res = await fetch(`https://api.blockcypher.com/v1/ltc/main/addrs/${address}?limit=50`);
    if (res.ok) {
      const body = await res.json();
      
      // Parse confirmed txrefs
      if (Array.isArray(body.txrefs)) {
        for (const ref of body.txrefs) {
          if (ref.tx_output_n >= 0 && ref.value === targetLitoshi) {
            return {
              found: true,
              confirmed: ref.confirmations && ref.confirmations >= 1,
              txHash: ref.tx_hash
            };
          }
        }
      }
      // Parse unconfirmed txrefs (mempool)
      if (Array.isArray(body.unconfirmed_txrefs)) {
        for (const ref of body.unconfirmed_txrefs) {
          if (ref.tx_output_n >= 0 && ref.value === targetLitoshi) {
            return {
              found: true,
              confirmed: false,
              txHash: ref.tx_hash
            };
          }
        }
      }
      return { found: false, confirmed: false, txHash: null };
    } else {
      console.warn(`[BLOCKCHAIN WARNING] BlockCypher returned status ${res.status}.`);
    }
  } catch (err) {
    console.warn(`[BLOCKCHAIN WARNING] BlockCypher fetch failed: ${err.message}.`);
  }

  // If all explorers failed, throw a consolidated error
  throw new Error('All free Litecoin blockchain explorers failed or returned rate limits.');
}

module.exports = {
  fetchLtcPrice,
  checkPayment,
};
