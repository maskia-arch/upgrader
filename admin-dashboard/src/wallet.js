const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bip39 = require('bip39');
const { HDKey } = require('@scure/bip32');
const bitcoin = require('bitcoinjs-lib');
const { secp256k1 } = require('@noble/curves/secp256k1');

// Wrap global fetch to automatically append User-Agent headers for blockchain explorers
const originalFetch = globalThis.fetch;
globalThis.fetch = async function (url, options = {}) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    ...(options.headers || {})
  };
  return originalFetch(url, { ...options, headers });
};

/**
 * Helper to delay/throttle between API requests.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch address balance in LTC with multi-explorer fallbacks.
 */
async function fetchLtcBalance(address) {
  // Explorer 1: litecoin.space (Esplora)
  try {
    const res = await fetch(`https://litecoin.space/api/address/${address}`);
    if (res.ok) {
      const info = await res.json();
      if (info && info.chain_stats) {
        return (info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum) / 100000000;
      }
    }
  } catch (err) {
    console.warn(`[BLOCKCHAIN WALLET WARNING] litecoin.space balance check failed for ${address}:`, err.message);
  }

  // Fallback Explorer 2: chain.so (v2 API)
  try {
    const res = await fetch(`https://chain.so/api/v2/get_address_balance/LTC/${address}`);
    if (res.ok) {
      const body = await res.json();
      if (body && body.status === 'success' && body.data) {
        const confirmed = parseFloat(body.data.confirmed_balance || 0);
        const unconfirmed = parseFloat(body.data.unconfirmed_balance || 0);
        return confirmed + unconfirmed;
      }
    }
  } catch (err) {
    console.warn(`[BLOCKCHAIN WALLET WARNING] chain.so balance check failed for ${address}:`, err.message);
  }

  // Fallback Explorer 3: blockcypher.com
  try {
    const res = await fetch(`https://api.blockcypher.com/v1/ltc/main/addrs/${address}?limit=1`);
    if (res.ok) {
      const body = await res.json();
      if (body && typeof body.balance === 'number') {
        const balance = body.balance || 0;
        const unconfirmed = body.unconfirmed_balance || 0;
        return (balance + unconfirmed) / 100000000;
      }
    }
  } catch (err) {
    console.warn(`[BLOCKCHAIN WALLET WARNING] blockcypher balance check failed for ${address}:`, err.message);
  }

  throw new Error(`Failed to fetch balance for address ${address} from all explorers.`);
}

/**
 * Fetch address UTXOs in satoshis/litoshis with multi-explorer fallbacks.
 * Returns array of: { txid, vout, value }
 */
async function fetchLtcUtxos(address) {
  // Explorer 1: litecoin.space (Esplora)
  try {
    const res = await fetch(`https://litecoin.space/api/address/${address}/utxo`);
    if (res.ok) {
      const utxos = await res.json();
      if (Array.isArray(utxos)) {
        return utxos.map(u => ({
          txid: u.txid,
          vout: u.vout,
          value: u.value // in satoshis
        }));
      }
    }
  } catch (err) {
    console.warn(`[BLOCKCHAIN WALLET WARNING] litecoin.space UTXOs check failed for ${address}:`, err.message);
  }

  // Fallback Explorer 2: chain.so (v2 API)
  try {
    const res = await fetch(`https://chain.so/api/v2/get_tx_unspent/LTC/${address}`);
    if (res.ok) {
      const body = await res.json();
      if (body && body.status === 'success' && body.data && Array.isArray(body.data.txs)) {
        return body.data.txs.map(t => ({
          txid: t.txid,
          vout: t.output_no,
          value: Math.round(parseFloat(t.value) * 100000000)
        }));
      }
    }
  } catch (err) {
    console.warn(`[BLOCKCHAIN WALLET WARNING] chain.so UTXOs check failed for ${address}:`, err.message);
  }

  // Fallback Explorer 3: blockcypher.com
  try {
    const res = await fetch(`https://api.blockcypher.com/v1/ltc/main/addrs/${address}?limit=50`);
    if (res.ok) {
      const body = await res.json();
      const utxos = [];
      // Confirmed txrefs
      if (Array.isArray(body.txrefs)) {
        body.txrefs.forEach(ref => {
          if (ref.tx_output_n >= 0 && !ref.spent) {
            utxos.push({
              txid: ref.tx_hash,
              vout: ref.tx_output_n,
              value: ref.value
            });
          }
        });
      }
      // Unconfirmed txrefs
      if (Array.isArray(body.unconfirmed_txrefs)) {
        body.unconfirmed_txrefs.forEach(ref => {
          if (ref.tx_output_n >= 0 && !ref.spent) {
            utxos.push({
              txid: ref.tx_hash,
              vout: ref.tx_output_n,
              value: ref.value
            });
          }
        });
      }
      return utxos;
    }
  } catch (err) {
    console.warn(`[BLOCKCHAIN WALLET WARNING] blockcypher UTXOs check failed for ${address}:`, err.message);
  }

  throw new Error(`Failed to fetch UTXOs for address ${address} from all explorers.`);
}

/**
 * Fetch raw transaction hex with multi-explorer fallbacks.
 */
async function fetchTxHex(txid) {
  // Explorer 1: litecoin.space (Esplora)
  try {
    const res = await fetch(`https://litecoin.space/api/tx/${txid}/hex`);
    if (res.ok) {
      const hex = await res.text();
      if (hex && hex.length > 10) return hex.trim();
    }
  } catch (err) {
    console.warn(`[BLOCKCHAIN WALLET WARNING] litecoin.space fetch hex failed for ${txid}:`, err.message);
  }

  // Fallback Explorer 2: chain.so (v2 API)
  try {
    const res = await fetch(`https://chain.so/api/v2/get_tx/LTC/${txid}`);
    if (res.ok) {
      const body = await res.json();
      if (body && body.status === 'success' && body.data && body.data.tx_hex) {
        return body.data.tx_hex.trim();
      }
    }
  } catch (err) {
    console.warn(`[BLOCKCHAIN WALLET WARNING] chain.so fetch hex failed for ${txid}:`, err.message);
  }

  // Fallback Explorer 3: blockcypher.com
  try {
    const res = await fetch(`https://api.blockcypher.com/v1/ltc/main/txs/${txid}?includeHex=true`);
    if (res.ok) {
      const body = await res.json();
      if (body && body.hex) return body.hex.trim();
    }
  } catch (err) {
    console.warn(`[BLOCKCHAIN WALLET WARNING] blockcypher fetch hex failed for ${txid}:`, err.message);
  }

  throw new Error(`Failed to fetch transaction hex for txid ${txid} from all explorers.`);
}

/**
 * Broadcast raw transaction hex with fallbacks.
 */
async function broadcastTx(txHex) {
  // Explorer 1: litecoin.space (Esplora)
  try {
    const res = await fetch('https://litecoin.space/api/tx', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: txHex
    });
    if (res.ok) {
      const txid = await res.text();
      if (txid && txid.length > 10) return txid.trim();
    }
  } catch (err) {
    console.warn('[BLOCKCHAIN WALLET WARNING] litecoin.space broadcast failed:', err.message);
  }

  // Fallback Explorer 2: blockcypher.com
  try {
    const res = await fetch('https://api.blockcypher.com/v1/ltc/main/txs/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx: txHex })
    });
    if (res.ok) {
      const body = await res.json();
      if (body && body.tx && body.tx.hash) {
        return body.tx.hash.trim();
      }
    }
  } catch (err) {
    console.warn('[BLOCKCHAIN WALLET WARNING] blockcypher broadcast failed:', err.message);
  }

  throw new Error('Failed to broadcast transaction via all available explorers.');
}


const WALLET_FILE_PATH = process.env.WALLET_PATH || path.join(__dirname, '../wallet.json');

// Ensure parent directory exists for persistent mounts
const walletDir = path.dirname(WALLET_FILE_PATH);
if (!fs.existsSync(walletDir)) {
  fs.mkdirSync(walletDir, { recursive: true });
}

const LITECOIN_NETWORK = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'ltc',
  bip32: {
    public: 0x019da462,  // Ltub
    private: 0x019d9cfe, // Lpriv
  },
  pubKeyHash: 0x30, // Starts with 'L'
  scriptHash: 0x32, // Starts with 'M'
  wif: 0xb0,
};

// In-memory unlocked state
let unlockedWallet = null;

/**
 * Checks if wallet.json exists
 */
function walletExists() {
  return fs.existsSync(WALLET_FILE_PATH);
}

/**
 * Lock wallet (clears in-memory keys)
 */
function lockWallet() {
  unlockedWallet = null;
}

/**
 * Returns true if wallet is unlocked in-memory
 */
function isUnlocked() {
  return unlockedWallet !== null;
}

/**
 * Gets currently unlocked wallet details
 */
function getUnlockedWallet() {
  if (!unlockedWallet) throw new Error('Wallet is locked');
  return unlockedWallet;
}

/**
 * Create a new wallet or restore from mnemonic
 */
async function createWallet(mnemonicPhrase, password) {
  let mnemonic = mnemonicPhrase ? mnemonicPhrase.trim() : null;
  
  if (!mnemonic) {
    mnemonic = bip39.generateMnemonic();
  } else {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Ungültige Mnemonic Seed Phrase!');
    }
  }

  // Convert to seed
  const seed = await bip39.mnemonicToSeed(mnemonic);

  // Derive master Ltub/Ltpv at m/44'/2'/0'
  const root = HDKey.fromMasterSeed(seed, LITECOIN_NETWORK.bip32);
  const accountNode = root.derive("m/44'/2'/0'");

  const xpub = accountNode.publicExtendedKey;
  const xprv = accountNode.privateExtendedKey;

  const walletData = {
    mnemonic,
    seed: seed.toString('hex'),
    xpub,
    xprv,
  };

  // Encrypt with password
  const salt = crypto.randomBytes(16);
  // scrypt key derivation
  const key = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  const iv = crypto.randomBytes(12); // GCM standard IV is 12 bytes
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(JSON.stringify(walletData), 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag();

  const fileData = {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    ciphertext,
    tag: tag.toString('hex'),
  };

  fs.writeFileSync(WALLET_FILE_PATH, JSON.stringify(fileData, null, 2));

  // Store in memory
  unlockedWallet = walletData;

  return { mnemonic, xpub };
}

/**
 * Unlock wallet from encrypted file
 */
function unlockWallet(password) {
  if (!walletExists()) throw new Error('Keine Wallet-Datei gefunden!');

  try {
    const fileContent = fs.readFileSync(WALLET_FILE_PATH, 'utf8');
    const fileData = JSON.parse(fileContent);

    const salt = Buffer.from(fileData.salt, 'hex');
    const iv = Buffer.from(fileData.iv, 'hex');
    const tag = Buffer.from(fileData.tag, 'hex');
    const ciphertext = fileData.ciphertext;

    // Derive key
    const key = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    const walletData = JSON.parse(decrypted);
    
    // Store in memory
    unlockedWallet = walletData;

    return { xpub: walletData.xpub };
  } catch (err) {
    throw new Error('Falsches Wallet-Passwort oder manipulierte Wallet-Datei!');
  }
}

/**
 * Derive a Litecoin receiving address from the master xpub (Ltub)
 */
function deriveAddress(xpub, index) {
  try {
    let versions = undefined;
    if (xpub.startsWith('Ltub') || xpub.startsWith('Ltpv')) {
      versions = LITECOIN_NETWORK.bip32;
    }
    const hdkey = HDKey.fromExtendedKey(xpub.trim(), versions);
    const child = hdkey.derive(`m/0/${index}`);
    
    const { address } = bitcoin.payments.p2pkh({
      pubkey: Buffer.from(child.publicKey),
      network: LITECOIN_NETWORK,
    });
    
    return address;
  } catch (error) {
    console.error(`[DERIVATION ERROR] Failed to derive index ${index}:`, error.message);
    throw error;
  }
}

/**
 * Generate pool of 50 addresses
 */
function generatePool(xpub) {
  const pool = [];
  for (let i = 0; i < 50; i++) {
    pool.push(deriveAddress(xpub, i));
  }
  return pool;
}

/**
 * Send LTC (Withdraw/Consolidate) from the 50 addresses
 */
async function sendTransaction(recipientAddress, amountLtc, feeLtc = 0.0001) {
  if (!isUnlocked()) throw new Error('Wallet ist gesperrt!');
  
  const wallet = getUnlockedWallet();
  const seedBuffer = Buffer.from(wallet.seed, 'hex');

  // Derive private keys for indices 0-49: path m/44'/2'/0'/0/index
  const root = HDKey.fromMasterSeed(seedBuffer, LITECOIN_NETWORK.bip32);
  const externalChainNode = root.derive("m/44'/2'/0'/0"); // external chain

  // Generate derived addresses to map UTXOs to their index
  const derivedAddresses = [];
  for (let i = 0; i < 50; i++) {
    const child = externalChainNode.derive(i);
    const { address } = bitcoin.payments.p2pkh({
      pubkey: Buffer.from(child.publicKey),
      network: LITECOIN_NETWORK,
    });
    derivedAddresses.push({ address, index: i, node: child });
  }

  // Fetch UTXOs for all 50 addresses
  const allUtxos = [];
  for (const item of derivedAddresses) {
    try {
      const utxos = await fetchLtcUtxos(item.address);
      if (Array.isArray(utxos)) {
        utxos.forEach(u => {
          allUtxos.push({
            txid: u.txid,
            vout: u.vout,
            value: u.value, // in satoshis/litoshis
            address: item.address,
            index: item.index,
            node: item.node
          });
        });
      }
    } catch (err) {
      console.warn(`[WALLET WATCH] UTXO fetch failed for ${item.address}:`, err.message);
    }
    // Respect API rate limits (1.5s delay)
    await delay(1500);
  }

  if (allUtxos.length === 0) {
    throw new Error('Kein Guthaben (UTXOs) auf den 50 Adressen gefunden.');
  }

  // Target amount in satoshis/litoshis
  const targetLitoshi = Math.round(amountLtc * 100000000);
  const feeLitoshi = Math.round(feeLtc * 100000000);
  const totalNeeded = targetLitoshi + feeLitoshi;

  // Select UTXOs
  let accumulated = 0;
  const selectedUtxos = [];
  for (const utxo of allUtxos) {
    selectedUtxos.push(utxo);
    accumulated += utxo.value;
    if (accumulated >= totalNeeded) break;
  }

  if (accumulated < totalNeeded) {
    const avail = (accumulated / 100000000).toFixed(6);
    throw new Error(`Ungenügendes Guthaben! Benötigt: ${(totalNeeded / 100000000).toFixed(6)} LTC, Verfügbar: ${avail} LTC`);
  }

  // Build PSBT transaction
  const psbt = new bitcoin.Psbt({ network: LITECOIN_NETWORK });

  // Add inputs
  for (const utxo of selectedUtxos) {
    // For legacy P2PKH addresses, we need the full previous transaction hex.
    const prevTxHex = await fetchTxHex(utxo.txid);

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      nonWitnessUtxo: Buffer.from(prevTxHex, 'hex'),
    });
    // Add small delay to respect limits
    await delay(500);
  }

  // Add destination output
  psbt.addOutput({
    address: recipientAddress,
    value: targetLitoshi,
  });

  // Add change output (send change back to address index 0)
  const changeValue = accumulated - totalNeeded;
  if (changeValue > 1000) { // Only add change output if it is larger than dust limit
    psbt.addOutput({
      address: derivedAddresses[0].address,
      value: changeValue,
    });
  }

  // Sign inputs
  for (let i = 0; i < selectedUtxos.length; i++) {
    const utxo = selectedUtxos[i];
    const childKey = utxo.node;

    const customSigner = {
      publicKey: Buffer.from(childKey.publicKey),
      async sign(hash) {
        const sig = secp256k1.sign(hash, childKey.privateKey);
        return Buffer.from(sig.toDER());
      }
    };

    await psbt.signInputAsync(i, customSigner);
  }

  // Finalize and extract
  psbt.finalizeAllInputs();
  const txHex = psbt.extractTransaction().toHex();

  // Broadcast transaction using fallback helpers
  const txHash = await broadcastTx(txHex);
  return txHash;
}

module.exports = {
  walletExists,
  lockWallet,
  isUnlocked,
  getUnlockedWallet,
  createWallet,
  unlockWallet,
  deriveAddress,
  generatePool,
  sendTransaction,
  LITECOIN_NETWORK,
  fetchLtcBalance,
  fetchLtcUtxos,
  fetchTxHex,
  broadcastTx,
};
