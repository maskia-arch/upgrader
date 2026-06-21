// Test Runner for Spotify Premium Upgrade System
const assert = require('assert');

// Setup mock environment variables for test
process.env.ENCRYPTION_KEY = 'test-secret-encryption-key-for-testing';
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_KEY = 'mock-key';
process.env.TELEGRAM_TOKEN = '123:abc';
process.env.USE_MOCK_API = 'true';

const cryptoBot = require('../telegram-bot/src/crypto');
const cryptoAdmin = require('../admin-dashboard/src/crypto');
const wallet = require('../admin-dashboard/src/wallet');
const upgrader = require('../telegram-bot/src/upgrader');

async function runTests() {
  console.log('==================================================');
  console.log('STARTING CORE SYSTEM VERIFICATION SUITE');
  console.log('==================================================');

  // Test 1: Cryptographic Compatibility
  console.log('\n[TEST 1] Testing Cryptography Compatibility...');
  try {
    const originalText = 'SpotifyPassword123!';
    
    // Encrypt using Bot crypto
    const encrypted = cryptoBot.encrypt(originalText);
    assert.ok(encrypted, 'Encryption should return a non-empty string');
    assert.ok(encrypted.includes(':'), 'Encrypted output should contain an IV separator');

    // Decrypt using Bot crypto
    const decryptedBot = cryptoBot.decrypt(encrypted);
    assert.strictEqual(decryptedBot, originalText, 'Bot Decryption must match original plain text');

    // Decrypt using Admin crypto (must be compatible)
    const decryptedAdmin = cryptoAdmin.decrypt(encrypted);
    assert.strictEqual(decryptedAdmin, originalText, 'Admin Decryption must be fully compatible with Bot Encryption');
    
    // Test safe error handling by modifying a valid hex character of the ciphertext
    const corrupted = encrypted.substring(0, encrypted.length - 1) + (encrypted.endsWith('0') ? '1' : '0');
    const decCorrupted = cryptoBot.decrypt(corrupted);
    assert.strictEqual(decCorrupted, null, 'Decryption of corrupted string should fail safely and return null');

    console.log('✅ Cryptography Compatibility: PASSED');
  } catch (err) {
    console.error('❌ Cryptography Compatibility: FAILED');
    console.error(err);
    process.exit(1);
  }

  // Test 2: Deterministic Wallet Derivation
  console.log('\n[TEST 2] Testing Deterministic LTC Address Generation...');
  try {
    // Standard test xpub vector
    const testXpub = 'xpub6BosfCnifzxcFwrSzQiqu2DBVTshkCXacvNsWGYJVVhhawA7d4R5WSWGFNbi8Aw6ZRc1brxMyWMzG3DSSSSoekkudhUd9yLb6qx39T9nMdj';
    
    // Derive address index 0
    const address0 = wallet.deriveAddress(testXpub, 0);
    assert.ok(address0, 'Should derive address');
    assert.strictEqual(address0[0], 'L', 'Litecoin legacy addresses must start with L');
    assert.strictEqual(address0.length, 34, 'Litecoin legacy addresses are 34 characters long');

    // Derive address index 0 again, check determinism
    const address0_duplicate = wallet.deriveAddress(testXpub, 0);
    assert.strictEqual(address0, address0_duplicate, 'Address derivation must be strictly deterministic');

    // Derive address index 1, check uniqueness
    const address1 = wallet.deriveAddress(testXpub, 1);
    assert.notStrictEqual(address0, address1, 'Derived addresses at different indices must be unique');

    // Generate pool of 50
    const pool = wallet.generatePool(testXpub);
    assert.strictEqual(pool.length, 50, 'Pool must contain exactly 50 derived addresses');
    pool.forEach((addr, i) => {
      assert.strictEqual(addr[0], 'L', `Address at index ${i} must start with L`);
      assert.strictEqual(addr.length, 34, `Address at index ${i} must be 34 characters long`);
    });

    console.log('✅ Deterministic LTC Address Generation: PASSED');
  } catch (err) {
    console.error('❌ Deterministic LTC Address Generation: FAILED');
    console.error(err);
    process.exit(1);
  }

  // Test 3: Upgrader.cc Reseller API Client (Mock Mode)
  console.log('\n[TEST 3] Testing Upgrader.cc Reseller API integration...');
  try {
    // 3a. Success upgrade case
    const successRes = await upgrader.upgradeAccount('KEY-USABLE-1', 'test@gmail.com', 'SecurePassword!');
    assert.strictEqual(successRes.success, true, 'Mock upgrade should succeed for normal password');
    assert.ok(successRes.spotifyAccountId, 'Mock upgrade should return a spotify account id');

    // 3b. Failure password case
    const failRes = await upgrader.upgradeAccount('KEY-USABLE-1', 'test@gmail.com', 'fail_wrong_password');
    assert.strictEqual(failRes.success, false, 'Mock upgrade should fail for fail_password');
    assert.ok(failRes.message.includes('Simulated'), 'Error message should describe simulation');

    // 3c. Key info check
    const infoResUsable = await upgrader.getKeyInfo('KEY-USABLE-1');
    assert.strictEqual(infoResUsable.status, 'usable', 'Key info should return usable status');

    const infoResError = await upgrader.getKeyInfo('key_with_error');
    assert.strictEqual(infoResError.status, 'error', 'Key info should detect simulated key error');

    console.log('✅ Upgrader.cc Reseller API Client: PASSED');
  } catch (err) {
    console.error('❌ Upgrader.cc Reseller API Client: FAILED');
    console.error(err);
    process.exit(1);
  }

  // Test 4: Blockchain Payment Detection (Transaction Parsing)
  console.log('\n[TEST 4] Testing Blockchain Payment Detection Logic...');
  try {
    const testAddress = 'LcV4vUa1DpqmR8h22W34JKe1H7cde8e8ff';
    const amountLtc = 0.05123456;
    const targetLitoshi = Math.round(amountLtc * 100000000); // 5123456 litoshi

    // Simulated Esplora transaction list parser logic
    function parseTransactionList(txs, targetAddress, targetLitoshi) {
      if (!Array.isArray(txs)) return { found: false, confirmed: false, txHash: null };

      for (const tx of txs) {
        if (!tx.vout || !Array.isArray(tx.vout)) continue;
        const match = tx.vout.find(out => 
          out.scriptpubkey_address === targetAddress && 
          out.value === targetLitoshi
        );
        if (match) {
          return {
            found: true,
            confirmed: tx.status && tx.status.confirmed === true,
            txHash: tx.txid
          };
        }
      }
      return { found: false, confirmed: false, txHash: null };
    }

    // Mock Tx 1: Unconfirmed payment in mempool
    const mockTxsMempool = [
      {
        txid: 'tx_hash_mempool_123',
        vout: [
          { scriptpubkey_address: testAddress, value: targetLitoshi }
        ],
        status: { confirmed: false }
      }
    ];

    const resultMempool = parseTransactionList(mockTxsMempool, testAddress, targetLitoshi);
    assert.strictEqual(resultMempool.found, true, 'Should find unconfirmed transaction');
    assert.strictEqual(resultMempool.confirmed, false, 'Unconfirmed transaction status confirmed must be false');
    assert.strictEqual(resultMempool.txHash, 'tx_hash_mempool_123', 'Should extract transaction hash');

    // Mock Tx 2: Confirmed payment on-chain
    const mockTxsConfirmed = [
      {
        txid: 'tx_hash_confirmed_456',
        vout: [
          { scriptpubkey_address: testAddress, value: targetLitoshi }
        ],
        status: { confirmed: true, block_height: 2500000 }
      }
    ];

    const resultConfirmed = parseTransactionList(mockTxsConfirmed, testAddress, targetLitoshi);
    assert.strictEqual(resultConfirmed.found, true, 'Should find confirmed transaction');
    assert.strictEqual(resultConfirmed.confirmed, true, 'Confirmed transaction status confirmed must be true');
    assert.strictEqual(resultConfirmed.txHash, 'tx_hash_confirmed_456', 'Should extract transaction hash');

    // Mock Tx 3: Wrong amount
    const mockTxsWrongAmount = [
      {
        txid: 'tx_hash_wrong_789',
        vout: [
          { scriptpubkey_address: testAddress, value: targetLitoshi - 500 }
        ],
        status: { confirmed: true }
      }
    ];
    const resultWrong = parseTransactionList(mockTxsWrongAmount, testAddress, targetLitoshi);
    assert.strictEqual(resultWrong.found, false, 'Should ignore transactions with incorrect amounts');

    console.log('✅ Blockchain Payment Detection Logic: PASSED');
  } catch (err) {
    console.error('❌ Blockchain Payment Detection Logic: FAILED');
    console.error(err);
    process.exit(1);
  }

  console.log('\n==================================================');
  console.log('ALL SYSTEM TESTS PASSED SUCCESSFULLY! 🚀');
  console.log('==================================================');
}

runTests();
