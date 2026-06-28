const express = require('express');
const { supabase } = require('./db');
const { decrypt, encrypt } = require('./crypto');
const wallet = require('./wallet');
const config = require('./config');
const { upgradeAccount, getKeyInfo } = require('./upgrader');

const router = express.Router();

// Helper: Handle Supabase uninitialized table error
function handleDbError(err, res) {
  if (err && err.code === '42P01') {
    return res.json({
      error: 'database_not_initialized',
      message: 'Das SQL-Schema wurde noch nicht in PostgreSQL ausgeführt. Bitte stelle sicher, dass das SQL-Skript (database/schema.sql) in deiner PostgreSQL-Datenbank importiert wurde.'
    });
  }
  return res.status(500).json({ error: err ? err.message : 'Database error' });
}

// 1. Overview & Statistics
router.get('/stats', async (req, res) => {
  try {
    // Total users
    const { count: userCount, error: userErr } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Active subscriptions
    const { count: activeCount, error: activeErr } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Total revenue (Confirmed invoices)
    const { data: invoices, error: invErr } = await supabase
      .from('invoices')
      .select('amount_eur')
      .eq('status', 'confirmed');

    const totalRevenue = invoices ? invoices.reduce((sum, inv) => sum + parseFloat(inv.amount_eur), 0) : 0;

    // Keys Status aggregation
    const { data: keys, error: keyErr } = await supabase
      .from('upgrader_keys')
      .select('status');

    const keyStats = { usable: 0, active: 0, expired: 0, error: 0 };
    if (keys) {
      keys.forEach(k => {
        if (keyStats[k.status] !== undefined) keyStats[k.status]++;
      });
    }

    // Unresolved logs
    const { data: logs, error: logErr } = await supabase
      .from('system_logs')
      .select('*')
      .eq('is_resolved', false)
      .order('created_at', { ascending: false });

    // Recent subscriptions
    const { data: recentSubs, error: subErr } = await supabase
      .from('subscriptions')
      .select('*, users(telegram_id, username), packages(name)')
      .order('created_at', { ascending: false })
      .limit(10);

    // If any database table is missing, handle gracefully
    const firstErr = userErr || activeErr || invErr || keyErr || logErr || subErr;
    if (firstErr) {
      return handleDbError(firstErr, res);
    }

    res.json({
      stats: {
        users: userCount || 0,
        activeSubscriptions: activeCount || 0,
        revenueEur: totalRevenue,
        keys: keyStats,
      },
      unresolvedLogs: logs || [],
      recentSubscriptions: recentSubs || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all system logs
router.get('/logs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) return handleDbError(error, res);
    res.json(data || []);
  } catch (err) {
    handleDbError(err, res);
  }
});

// 2. Packages CRUD
router.get('/packages', async (req, res) => {
  console.log('[DEBUG GET /packages] Fetching all packages...');
  try {
    const { data, error } = await supabase.from('packages').select('*').order('created_at', { ascending: false });
    console.log('[DEBUG GET /packages] DB Result count:', data ? data.length : 0, 'Error:', error);
    if (error) return handleDbError(error, res);
    res.json(data || []);
  } catch (err) {
    console.error('[DEBUG GET /packages] Catch error:', err);
    handleDbError(err, res);
  }
});

router.post('/packages', async (req, res) => {
  console.log('[DEBUG POST /packages] req.body:', req.body);
  try {
    const { name, duration_months, price_eur } = req.body;
    const insertPayload = { 
      name, 
      duration_months: parseInt(duration_months), 
      price_eur: parseFloat(price_eur) 
    };
    console.log('[DEBUG POST /packages] Inserting payload:', insertPayload);
    const { data, error } = await supabase
      .from('packages')
      .insert(insertPayload)
      .select()
      .single();

    console.log('[DEBUG POST /packages] DB Result:', { data, error });
    if (error) return handleDbError(error, res);
    res.json(data);
  } catch (err) {
    console.error('[DEBUG POST /packages] Catch error:', err);
    handleDbError(err, res);
  }
});

router.put('/packages/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`[DEBUG PUT /packages/${id}] req.body:`, req.body);
  try {
    const { name, duration_months, price_eur } = req.body;
    const updatePayload = { 
      name, 
      duration_months: parseInt(duration_months), 
      price_eur: parseFloat(price_eur) 
    };
    console.log(`[DEBUG PUT /packages/${id}] Updating payload:`, updatePayload);
    const { data, error } = await supabase
      .from('packages')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    console.log(`[DEBUG PUT /packages/${id}] DB Result:`, { data, error });
    if (error) return handleDbError(error, res);
    res.json(data);
  } catch (err) {
    console.error(`[DEBUG PUT /packages/${id}] Catch error:`, err);
    handleDbError(err, res);
  }
});

router.delete('/packages/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`[DEBUG DELETE /packages/${id}] deleting...`);
  try {
    const { error } = await supabase.from('packages').delete().eq('id', id);
    console.log(`[DEBUG DELETE /packages/${id}] DB Result error:`, error);
    if (error) return handleDbError(error, res);
    res.sendStatus(204);
  } catch (err) {
    console.error(`[DEBUG DELETE /packages/${id}] Catch error:`, err);
    handleDbError(err, res);
  }
});

// 3. Keys CRUD
router.get('/keys', async (req, res) => {
  try {
    const { data, error } = await supabase.from('upgrader_keys').select('*').order('created_at', { ascending: false });
    if (error) return handleDbError(error, res);
    res.json(data || []);
  } catch (err) {
    handleDbError(err, res);
  }
});

router.post('/keys/import', async (req, res) => {
  try {
    const { rawKeys } = req.body;
    if (!rawKeys || typeof rawKeys !== 'string') {
      return res.status(400).json({ error: 'Raw keys string is required' });
    }

    const keys = rawKeys
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (keys.length === 0) {
      return res.status(400).json({ error: 'No valid keys provided' });
    }

    const insertData = keys.map(k => ({ api_key: k, status: 'usable' }));
    
    const { data, error } = await supabase
      .from('upgrader_keys')
      .insert(insertData)
      .select();

    if (error) return handleDbError(error, res);
    res.json({ success: true, count: data.length });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.delete('/keys/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('upgrader_keys').delete().eq('id', id);
    if (error) return handleDbError(error, res);
    res.json({ success: true });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.post('/keys/check/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: key, error } = await supabase.from('upgrader_keys').select('*').eq('id', id).single();
    if (error || !key) return res.status(404).json({ error: 'Key not found' });

    const check = await getKeyInfo(key.api_key);
    
    const { data: updatedKey, error: updateErr } = await supabase
      .from('upgrader_keys')
      .update({
        status: check.status === 'usable' || check.status === 'active' || check.status === 'expired' || check.status === 'error' ? check.status : 'error',
        error_message: check.status === 'error' ? check.message || 'Unknown error' : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;
    res.json(updatedKey);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. LTC Addresses Pool
router.get('/addresses', async (req, res) => {
  try {
    const { data, error } = await supabase.from('ltc_addresses').select('*').order('address_index', { ascending: true });
    if (error) return handleDbError(error, res);
    res.json(data || []);
  } catch (err) {
    handleDbError(err, res);
  }
});

router.post('/addresses/release/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('ltc_addresses')
      .update({ is_reserved: false, reserved_until: null })
      .eq('id', id)
      .select()
      .single();

    if (error) return handleDbError(error, res);
    res.json(data);
  } catch (err) {
    handleDbError(err, res);
  }
});

router.get('/addresses/balances', async (req, res) => {
  console.log('[DEBUG GET /addresses/balances] Starting sync & balance check...');
  try {
    // Sync address pool first if wallet is unlocked (allows recovering addresses from a restored wallet)
    if (wallet.isUnlocked()) {
      try {
        const { xpub } = wallet.getUnlockedWallet();
        console.log('[DEBUG GET /addresses/balances] Syncing addresses from xpub...');
        await syncAddressPoolToDb(xpub);
        console.log('[DEBUG GET /addresses/balances] Addresses sync completed.');
      } catch (syncErr) {
        console.error('[DEBUG GET /addresses/balances] Sync address pool error:', syncErr);
      }
    } else {
      console.log('[DEBUG GET /addresses/balances] Wallet is locked, skipping address sync.');
    }

    const { data: addrs, error } = await supabase.from('ltc_addresses').select('*').order('address_index', { ascending: true });
    if (error) {
      console.error('[DEBUG GET /addresses/balances] DB select error:', error);
      return handleDbError(error, res);
    }
    if (!addrs || addrs.length === 0) {
      console.log('[DEBUG GET /addresses/balances] No addresses found in DB.');
      return res.json([]);
    }

    console.log(`[DEBUG GET /addresses/balances] Checking balances for ${addrs.length} addresses in batches of 10...`);
    const results = [];
    const batchSize = 10;
    for (let i = 0; i < addrs.length; i += batchSize) {
      const batch = addrs.slice(i, i + batchSize);
      console.log(`[DEBUG GET /addresses/balances] Processing batch ${Math.floor(i / batchSize) + 1}...`);
      await Promise.all(batch.map(async (addr) => {
        let balance = 0;
        try {
          balance = await wallet.fetchLtcBalance(addr.ltc_address);
        } catch (err) {
          console.warn(`[BALANCE CHECK WARNING] Failed fetching for address ${addr.ltc_address}:`, err.message);
        }
        results.push({
          id: addr.id,
          ltc_address: addr.ltc_address,
          address_index: addr.address_index,
          balanceLtc: balance
        });
      }));
      if (i + batchSize < addrs.length) {
        console.log('[DEBUG GET /addresses/balances] Waiting 500ms before next batch...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('[DEBUG GET /addresses/balances] Balance check completed successfully.');
    res.json(results);
  } catch (err) {
    console.error('[DEBUG GET /addresses/balances] Catch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin Decisions: Get users flagged for checkout spam limits
router.get('/admin/decisions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('requires_admin_decision', true)
      .order('created_at', { ascending: false });

    if (error) return handleDbError(error, res);
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Decisions: Ban user (exclude entirely)
router.post('/admin/decisions/:id/ban', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('users')
      .update({
        is_banned: true,
        requires_admin_decision: false,
        checkout_blocked_until: null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return handleDbError(error, res);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Decisions: Tolerate user (reset counters and lift block)
router.post('/admin/decisions/:id/tolerate', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('users')
      .update({
        lockout_count: 0,
        requires_admin_decision: false,
        checkout_blocked_until: null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return handleDbError(error, res);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. System Logs Resolution
router.post('/logs/resolve/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('system_logs')
      .update({ is_resolved: true })
      .eq('id', id)
      .select()
      .single();

    if (error) return handleDbError(error, res);
    res.json(data);
  } catch (err) {
    handleDbError(err, res);
  }
});

// 6. Manual Retry & Overrides
router.post('/subscriptions/retry/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .select('*, packages(duration_months)')
      .eq('id', id)
      .single();

    if (subErr || !sub) return res.status(404).json({ error: 'Subscription not found' });
    if (!sub.spotify_email || !sub.spotify_password_encrypted) {
      return res.status(400).json({ error: 'Credentials not submitted yet' });
    }

    const password = decrypt(sub.spotify_password_encrypted);
    if (!password) return res.status(500).json({ error: 'Failed to decrypt password' });

    let keyObj = null;
    if (sub.key_id) {
      const { data: existingKey } = await supabase.from('upgrader_keys').select('*').eq('id', sub.key_id).single();
      keyObj = existingKey;
    }

    if (!keyObj || keyObj.status === 'error' || keyObj.status === 'expired') {
      const { data: freshKeys } = await supabase.from('upgrader_keys').select('*').eq('status', 'usable').limit(1);
      if (freshKeys && freshKeys.length > 0) {
        keyObj = freshKeys[0];
        await supabase.from('subscriptions').update({ key_id: keyObj.id }).eq('id', sub.id);
      }
    }

    if (!keyObj) {
      return res.status(400).json({ error: 'No usable upgrade keys available in key pool.' });
    }

    const upgradeRes = await upgradeAccount(keyObj.api_key, sub.spotify_email, password);

    if (upgradeRes.success) {
      await supabase
        .from('upgrader_keys')
        .update({ status: 'active', spotify_account_id: upgradeRes.spotifyAccountId || null, error_message: null, updated_at: new Date().toISOString() })
        .eq('id', keyObj.id);

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + sub.packages.duration_months);

      const { data: updatedSub } = await supabase
        .from('subscriptions')
        .update({ status: 'active', expires_at: expiresAt.toISOString(), updated_at: new Date().toISOString() })
        .eq('id', sub.id)
        .select()
        .single();

      res.json({ success: true, message: 'Upgrade succeeded', subscription: updatedSub });
    } else {
      await supabase
        .from('upgrader_keys')
        .update({ status: 'error', error_message: upgradeRes.message, updated_at: new Date().toISOString() })
        .eq('id', keyObj.id);

      await supabase
        .from('subscriptions')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', sub.id);

      res.json({ success: false, message: upgradeRes.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/subscriptions/:id', async (req, res) => {
  const { id } = req.params;
  const { spotify_email, spotify_password, status, expires_at } = req.body;

  try {
    const updateData = {};
    if (spotify_email) updateData.spotify_email = spotify_email;
    if (spotify_password) {
      updateData.spotify_password_encrypted = encrypt(spotify_password);
    }
    
    // Status validation
    if (status !== undefined) {
      const validStatuses = ['pending_payment', 'activating', 'active', 'expired', 'renewing', 'failed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid subscription status' });
      }
      updateData.status = status;
    }

    // Expiration date validation
    if (expires_at !== undefined) {
      updateData.expires_at = expires_at ? new Date(expires_at).toISOString() : null;
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('subscriptions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return handleDbError(error, res);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/subscriptions/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('subscriptions')
      .delete()
      .eq('id', id);

    if (error) return handleDbError(error, res);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================================================
// 7. INTEGRATED SECURE LOCAL WALLET ENDPOINTS
// ==================================================

// Generate a new 12-word mnemonic phrase (helper for UI creation step)
router.get('/wallet/mnemonic', (req, res) => {
  try {
    const mnemonic = require('bip39').generateMnemonic();
    res.json({ mnemonic });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync xpub derived addresses pool to Supabase
async function syncAddressPoolToDb(xpub) {
  const derivedAddresses = wallet.generatePool(xpub);
  
  // Fetch existing addresses from DB
  const { data: existingAddrs, error: selectErr } = await supabase
    .from('ltc_addresses')
    .select('*');
  
  if (selectErr && selectErr.code !== '42P01') throw selectErr;
  
  const dbMap = new Map();
  if (existingAddrs) {
    existingAddrs.forEach(a => dbMap.set(a.address_index, a));
  }
  
  for (let i = 0; i < 50; i++) {
    const derivedAddr = derivedAddresses[i];
    const dbRecord = dbMap.get(i);
    
    if (dbRecord) {
      if (dbRecord.ltc_address !== derivedAddr) {
        // Address has changed (new wallet restored), update it and reset reservations
        const { error: updateErr } = await supabase
          .from('ltc_addresses')
          .update({
            ltc_address: derivedAddr,
            is_reserved: false,
            reserved_until: null,
            use_count: 0
          })
          .eq('id', dbRecord.id);
        if (updateErr) console.error(`[SYNC WARNING] Failed to update address at index ${i}:`, updateErr.message);
      }
    } else {
      // Insert missing address
      const { error: insertErr } = await supabase
        .from('ltc_addresses')
        .insert({
          ltc_address: derivedAddr,
          address_index: i,
          is_reserved: false,
          reserved_until: null,
          use_count: 0
        });
      if (insertErr) console.error(`[SYNC WARNING] Failed to insert address at index ${i}:`, insertErr.message);
    }
  }
}

// Get wallet status (lock/unlock status and existence)
router.get('/wallet/status', (req, res) => {
  try {
    const exists = wallet.walletExists();
    const unlocked = wallet.isUnlocked();
    let xpub = null;
    let mnemonic = null;

    if (unlocked) {
      const data = wallet.getUnlockedWallet();
      xpub = data.xpub;
      mnemonic = data.mnemonic;
    }

    res.json({ exists, unlocked, xpub, mnemonic });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create wallet
router.post('/wallet/create', async (req, res) => {
  const { mnemonicPhrase, password } = req.body;
  if (!password) return res.status(400).json({ error: 'Passwort zum Verschlüsseln wird benötigt.' });

  try {
    const result = await wallet.createWallet(mnemonicPhrase, password);
    
    // Automatically sync address pool to Supabase database
    try {
      await syncAddressPoolToDb(result.xpub);
    } catch (dbErr) {
      console.warn('[WALLET SYNC WARNING] Failed to sync address pool to Supabase. DB tables might not exist yet:', dbErr.message);
    }

    res.json({
      success: true,
      mnemonic: result.mnemonic,
      xpub: result.xpub
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unlock wallet
router.post('/wallet/unlock', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Passwort wird benötigt.' });

  try {
    const result = wallet.unlockWallet(password);

    // Verify and sync address pool to Supabase
    try {
      await syncAddressPoolToDb(result.xpub);
    } catch (dbErr) {
      console.warn('[WALLET SYNC WARNING] Failed to sync address pool to Supabase:', dbErr.message);
    }

    res.json({ success: true, xpub: result.xpub });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Lock wallet
router.post('/wallet/lock', (req, res) => {
  wallet.lockWallet();
  res.json({ success: true });
});

// Withdraw / Send LTC transaction
router.post('/wallet/withdraw', async (req, res) => {
  const { recipientAddress, amountLtc, feeLtc } = req.body;
  if (!recipientAddress || !amountLtc) {
    return res.status(400).json({ error: 'Empfängeradresse und Betrag werden benötigt.' });
  }

  try {
    const fee = feeLtc ? parseFloat(feeLtc) : 0.0001;
    const txHash = await wallet.sendTransaction(recipientAddress, parseFloat(amountLtc), fee);
    res.json({ success: true, txHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Broadcasts
router.get('/broadcasts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('broadcasts')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) return handleDbError(error, res);
    res.json(data || []);
  } catch (err) {
    handleDbError(err, res);
  }
});

router.post('/broadcasts', async (req, res) => {
  try {
    const { message, scheduled_at } = req.body;
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    const trimmedMsg = message.trim();
    const isImmediate = !scheduled_at;

    if (isImmediate) {
      // Immediate broadcast
      // 1. Fetch all users
      const { data: users, error: userErr } = await supabase.from('users').select('id, telegram_id');
      if (userErr) return handleDbError(userErr, res);

      let sentCount = 0;
      let failedCount = 0;

      const token = config.telegramToken;
      if (!token || token.includes('your-telegram-token') || token.includes('123456789:ABC')) {
        return res.status(400).json({
          error: 'telegram_token_not_configured',
          message: 'Der Telegram Bot Token ist nicht konfiguriert oder ungültig. Bitte trage deinen echten Token in telegram-bot/.env ein.'
        });
      }

      // Send to all users
      for (const u of users) {
        if (!u.telegram_id) continue;
        
        try {
          const url = `https://api.telegram.org/bot${token}/sendMessage`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: u.telegram_id,
              text: trimmedMsg,
              parse_mode: 'Markdown'
            })
          });

          if (response.ok) {
            sentCount++;
            // Reset delivery failure tracking
            await supabase
              .from('users')
              .update({ last_delivery_failed_at: null, check_prompt_sent_at: null })
              .eq('id', u.id);
          } else {
            failedCount++;
            // Set delivery failure tracking
            await supabase
              .from('users')
              .update({ last_delivery_failed_at: new Date().toISOString() })
              .eq('id', u.id);
          }
        } catch (err) {
          failedCount++;
          await supabase
            .from('users')
            .update({ last_delivery_failed_at: new Date().toISOString() })
            .eq('id', u.id);
        }

        // Delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Insert broadcast as sent
      const { data: bcData, error: bcErr } = await supabase
        .from('broadcasts')
        .insert({
          message: trimmedMsg,
          scheduled_at: null,
          status: 'sent',
          sent_count: sentCount,
          error_message: failedCount > 0 ? `${failedCount} deliveries failed.` : null
        })
        .select()
        .single();

      if (bcErr) return handleDbError(bcErr, res);

      return res.json({
        success: true,
        sent_count: sentCount,
        failed_count: failedCount,
        broadcast: bcData
      });

    } else {
      // Scheduled broadcast
      const { data, error } = await supabase
        .from('broadcasts')
        .insert({
          message: trimmedMsg,
          scheduled_at: new Date(scheduled_at).toISOString(),
          status: 'pending',
          sent_count: 0
        })
        .select()
        .single();

      if (error) return handleDbError(error, res);
      res.json(data);
    }
  } catch (err) {
    handleDbError(err, res);
  }
});

router.delete('/broadcasts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('broadcasts')
      .delete()
      .eq('id', id);
    
    if (error) return handleDbError(error, res);
    res.json({ success: true });
  } catch (err) {
    handleDbError(err, res);
  }
});

// Coupons CRUD
router.get('/coupons', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return handleDbError(error, res);
    res.json(data || []);
  } catch (err) {
    handleDbError(err, res);
  }
});

router.post('/coupons', async (req, res) => {
  try {
    let { code, discount_type, discount_value, expires_at, max_uses } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Code is required and must be a string' });
    }
    code = code.trim().toUpperCase();
    if (!/^[A-Z0-9\-_]+$/.test(code)) {
      return res.status(400).json({ error: 'Code must only contain letters, numbers, dashes, and underscores' });
    }
    if (discount_type !== 'percentage' && discount_type !== 'fixed') {
      return res.status(400).json({ error: 'Discount type must be percentage or fixed' });
    }
    const val = parseFloat(discount_value);
    if (isNaN(val) || val <= 0) {
      return res.status(400).json({ error: 'Discount value must be a positive number' });
    }
    if (discount_type === 'percentage' && val > 100) {
      return res.status(400).json({ error: 'Percentage discount cannot exceed 100%' });
    }
    
    let expiry = null;
    if (expires_at) {
      const dateVal = new Date(expires_at);
      if (isNaN(dateVal.getTime())) {
        return res.status(400).json({ error: 'Invalid expiration date' });
      }
      expiry = dateVal.toISOString();
    }

    let maxUsesVal = null;
    if (max_uses !== undefined && max_uses !== null && max_uses !== '') {
      maxUsesVal = parseInt(max_uses);
      if (isNaN(maxUsesVal) || maxUsesVal <= 0) {
        return res.status(400).json({ error: 'Max uses must be a positive integer' });
      }
    }

    const { data, error } = await supabase
      .from('coupons')
      .insert({
        code,
        discount_type,
        discount_value: val,
        expires_at: expiry,
        max_uses: maxUsesVal,
        use_count: 0
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'coupon_exists', message: 'A coupon with this code already exists' });
      }
      return handleDbError(error, res);
    }
    res.json(data);
  } catch (err) {
    handleDbError(err, res);
  }
});

router.delete('/coupons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('coupons')
      .delete()
      .eq('id', id);
    
    if (error) return handleDbError(error, res);
    res.json({ success: true });
  } catch (err) {
    handleDbError(err, res);
  }
});

// 9. Feedback Ratings
router.get('/feedback', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('feedback')
      .select('*, users(telegram_id, username), subscriptions(packages(name))')
      .order('created_at', { ascending: false });
    
    if (error) return handleDbError(error, res);
    res.json(data || []);
  } catch (err) {
    handleDbError(err, res);
  }
});

router.delete('/feedback/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('feedback')
      .delete()
      .eq('id', id);
    
    if (error) return handleDbError(error, res);
    res.json({ success: true });
  } catch (err) {
    handleDbError(err, res);
  }
});

module.exports = router;

