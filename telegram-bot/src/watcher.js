const { supabase } = require('./db');
const { decrypt } = require('./crypto');
const { checkPayment } = require('./blockchain');
const { renewAccount, getKeyInfo } = require('./upgrader');
const { t } = require('./locales');

// Initialize with bot instance for sending messages
let telegramBot = null;

function setBotInstance(bot) {
  telegramBot = bot;
}

/**
 * Send message to user via Telegram
 */
async function notifyUser(telegramId, text) {
  if (!telegramBot) return;
  try {
    await telegramBot.telegram.sendMessage(telegramId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(`[WATCHER ERROR] Failed to send notification to user ${telegramId}:`, err.message);
  }
}

/**
 * 1. Blockchain Payment Watcher Loop
 * Scans all unpaid or detected invoices, verifies on-chain transaction matching target LTC amounts.
 */
async function watchPayments() {
  console.log('[WATCHER] Checking pending invoices...');
  try {
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*, ltc_addresses(ltc_address), subscriptions(user_id, users(telegram_id, language))')
      .in('status', ['unpaid', 'detected']);

    if (error) throw error;
    if (!invoices || invoices.length === 0) return;

    const now = new Date();

    for (const inv of invoices) {
      // Delay check to stay within API limits of free block explorers
      await new Promise(resolve => setTimeout(resolve, 1500));

      const telegramId = inv.subscriptions?.users?.telegram_id;
      const language = inv.subscriptions?.users?.language || 'en';
      const address = inv.ltc_addresses?.ltc_address;
      
      // Handle Expiration
      if (new Date(inv.expires_at) < now) {
        console.log(`[WATCHER] Invoice ${inv.id} expired.`);
        // Update Invoice
        await supabase.from('invoices').update({ status: 'expired' }).eq('id', inv.id);
        // Release address
        await supabase.from('ltc_addresses').update({ is_reserved: false, reserved_until: null }).eq('id', inv.ltc_address_id);
        // Set subscription status to cancelled
        await supabase.from('subscriptions').update({ status: 'cancelled' }).eq('id', inv.sub_id);
        
        if (telegramId) {
          await notifyUser(telegramId, t('notify_invoice_expired', language));
        }
        continue;
      }

      // Check blockchain
      try {
        const check = await checkPayment(address, inv.amount_ltc);

        if (check.found) {
          if (check.confirmed) {
            console.log(`[WATCHER] Payment CONFIRMED for invoice ${inv.id}`);
            
            // Update DB
            await supabase.from('invoices').update({ status: 'confirmed', tx_hash: check.txHash }).eq('id', inv.id);
            await supabase.from('ltc_addresses').update({ is_reserved: false, reserved_until: null }).eq('id', inv.ltc_address_id);
            await supabase.from('subscriptions').update({ status: 'activating', updated_at: new Date().toISOString() }).eq('id', inv.sub_id);

            if (telegramId) {
              await notifyUser(telegramId, 
                t('pay_check_confirmed_success', language, { txHash: check.txHash.substring(0, 16) })
              );
            }
          } else if (inv.status === 'unpaid') {
            // Found in mempool, status transitions unpaid -> detected
            console.log(`[WATCHER] Payment DETECTED in mempool for invoice ${inv.id}`);
            
            await supabase.from('invoices').update({ status: 'detected', tx_hash: check.txHash }).eq('id', inv.id);

            if (telegramId) {
              await notifyUser(telegramId, 
                t('pay_check_detected', language, { txHash: check.txHash.substring(0, 16) })
              );
            }
          }
        }
      } catch (err) {
        console.error(`[WATCHER ERROR] Failed checking invoice ${inv.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[WATCHER ERROR] Error in watchPayments loop:', err.message);
  }
}

/**
 * 2. Subscription Expiration Worker
 * Checks for expired active subscriptions, deactivates them, and releases key slots at upgrader.cc.
 */
async function checkExpirations() {
  console.log('[WORKER] Checking active subscriptions for expiration...');
  try {
    const { data: expiredSubs, error } = await supabase
      .from('subscriptions')
      .select('*, upgrader_keys(api_key), users(telegram_id, language)')
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString());

    if (error) throw error;
    if (!expiredSubs || expiredSubs.length === 0) return;

    for (const sub of expiredSubs) {
      console.log(`[WORKER] Subscription ${sub.id} has expired.`);
      
      // Update DB status
      await supabase.from('subscriptions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', sub.id);

      if (sub.upgrader_keys && sub.upgrader_keys.api_key) {
        // Free key at upgrader.cc
        const decryptedPassword = decrypt(sub.spotify_password_encrypted);
        const renewRes = await renewAccount(sub.upgrader_keys.api_key, sub.spotify_email, decryptedPassword);
        
        if (renewRes.success) {
          // Set key status back to usable so it can be assigned to a new customer
          await supabase.from('upgrader_keys').update({ status: 'usable', spotify_account_id: null }).eq('id', sub.key_id);
        } else {
          console.error(`[WORKER ERROR] Failed to release key ${sub.upgrader_keys.api_key} for expired sub ${sub.id}: ${renewRes.message}`);
          await supabase.from('system_logs').insert({
            level: 'ERROR',
            component: 'API',
            message: 'Key release for expired subscription failed',
            details: { sub_id: sub.id, key: sub.upgrader_keys.api_key, error: renewRes.message }
          });
        }
      }

      if (sub.users && sub.users.telegram_id) {
        const language = sub.users?.language || 'en';
        await notifyUser(sub.users.telegram_id, t('notify_expired', language));
      }
    }
  } catch (err) {
    console.error('[WORKER ERROR] Error in checkExpirations loop:', err.message);
  }
}

/**
 * 3. Replacement Polling Worker ("Ersatz anfragen")
 * Checks renewing subscriptions, queries upgrader.cc to verify if key is ready for reuse.
 */
async function checkReplacements() {
  console.log('[WORKER] Checking active replacements (renewing status)...');
  try {
    const { data: renewingSubs, error } = await supabase
      .from('subscriptions')
      .select('*, upgrader_keys(*), users(telegram_id, language)')
      .eq('status', 'renewing');

    if (error) throw error;
    if (!renewingSubs || renewingSubs.length === 0) return;

    for (const sub of renewingSubs) {
      if (!sub.upgrader_keys || !sub.upgrader_keys.api_key) continue;

      const key = sub.upgrader_keys;

      try {
        // Query upgrader.cc key status
        const info = await getKeyInfo(key.api_key);

        if (info.status === 'usable') {
          console.log(`[WORKER] Key ${key.api_key} is now usable again! Notifying user...`);

          // Update key status to usable and clear spotify_account_id in database
          await supabase
            .from('upgrader_keys')
            .update({ status: 'usable', spotify_account_id: null, error_message: null, updated_at: new Date().toISOString() })
            .eq('id', key.id);

          // Notify user to enter credentials for a new account
          if (sub.users && sub.users.telegram_id) {
            const language = sub.users?.language || 'en';
            await notifyUser(sub.users.telegram_id, t('notify_replace_ready', language));
          }
        }
      } catch (err) {
        console.error(`[WORKER ERROR] Failed polling key ${key.api_key} status:`, err.message);
      }
    }
  } catch (err) {
    console.error('[WORKER ERROR] Error in checkReplacements loop:', err.message);
  }
}

/**
 * 4. Active Upgrade Polling Worker
 * Checks subscriptions in 'activating' status, polls upgrader.cc key status to verify success or specific error codes.
 */
async function watchUpgrades() {
  console.log('[WORKER] Checking active upgrades (activating status)...');
  try {
    const { data: activatingSubs, error } = await supabase
      .from('subscriptions')
      .select('*, upgrader_keys(*), packages(*), users(telegram_id, language)')
      .eq('status', 'activating');

    if (error) throw error;
    if (!activatingSubs || activatingSubs.length === 0) return;

    for (const sub of activatingSubs) {
      if (!sub.upgrader_keys || !sub.upgrader_keys.api_key) continue;

      const key = sub.upgrader_keys;
      const telegramId = sub.users?.telegram_id;

      try {
        // Poll key status
        const info = await getKeyInfo(key.api_key);
        console.log(`[WORKER] Key ${key.api_key} status for sub ${sub.id}: ${info.status}`);

        if (info.status === 'active') {
          // Success! Calculate expiration
          let expiresAt;
          let isReplacement = false;
          if (sub.expires_at) {
            expiresAt = new Date(sub.expires_at);
            expiresAt.setHours(expiresAt.getHours() + 48);
            isReplacement = true;
          } else {
            expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + sub.packages.duration_months);
          }

          // Update DB
          await supabase
            .from('subscriptions')
            .update({
              status: 'active',
              expires_at: expiresAt.toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', sub.id);

          await supabase
            .from('upgrader_keys')
            .update({
              status: 'active',
              error_message: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', key.id);

          if (telegramId) {
            const language = sub.users?.language || 'en';
            const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
            const localeStr = language === 'de' ? 'de-DE' : (language === 'ru' ? 'ru-RU' : 'en-US');
            const dateStr = expiresAt.toLocaleString(localeStr, dateOptions);
            const compMsg = isReplacement ? t('notify_upgrade_success_comp', language) : '';

            const successMsg = t('notify_upgrade_success', language, {
              email: sub.spotify_email,
              pkgName: sub.packages?.name || '',
              date: dateStr,
              compMsg: compMsg
            });
            
            await notifyUser(telegramId, successMsg);
          }
        } else if (info.status === 'error' || (info.message && info.status !== 'usable')) {
          // An error occurred during background processing
          const errMsg = info.message || key.error_message || 'Unbekannter Fehler';

          await supabase.from('system_logs').insert({
            level: 'ERROR',
            component: 'WATCHER',
            message: `Background upgrade error for Sub ${sub.id}: ${errMsg}`,
            details: { key: key.api_key, error: errMsg, email: sub.spotify_email }
          });

          // Check error type
          const isCredentialError = errMsg.toLowerCase().includes('password') || 
                                    errMsg.toLowerCase().includes('credential') || 
                                    errMsg.toLowerCase().includes('login') ||
                                    errMsg.toLowerCase().includes('incorrect') ||
                                    errMsg.toLowerCase().includes('invalid account details');

          const isFamilyLimitError = errMsg.toLowerCase().includes('12 months') || 
                                     errMsg.toLowerCase().includes('family limit') || 
                                     errMsg.toLowerCase().includes('12 monate') ||
                                     errMsg.toLowerCase().includes('once per year');

          const language = sub.users?.language || 'en';
          if (isCredentialError) {
            // Mark sub as failed so user can re-submit
            await supabase.from('subscriptions').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', sub.id);
            await supabase.from('upgrader_keys').update({ status: 'usable', error_message: errMsg, updated_at: new Date().toISOString() }).eq('id', key.id);

            if (telegramId) {
              await notifyUser(telegramId, t('upgrade_failed_credentials', language));
            }
          } else if (isFamilyLimitError) {
            // Mark sub as failed, user must supply a different account
            await supabase.from('subscriptions').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', sub.id);
            await supabase.from('upgrader_keys').update({ status: 'usable', error_message: errMsg, updated_at: new Date().toISOString() }).eq('id', key.id);

            if (telegramId) {
              await notifyUser(telegramId, t('upgrade_failed_family_limit', language));
            }
          } else {
            // Generic error, set status failed but notify user about delay
            await supabase.from('subscriptions').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', sub.id);
            await supabase.from('upgrader_keys').update({ status: 'error', error_message: errMsg, updated_at: new Date().toISOString() }).eq('id', key.id);

            if (telegramId) {
              await notifyUser(telegramId, t('upgrade_failed_technical', language, { error: errMsg }));
            }
          }
        }
      } catch (err) {
        console.error(`[WORKER ERROR] Failed polling key ${key.api_key} status for sub ${sub.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[WORKER ERROR] Error in watchUpgrades loop:', err.message);
  }
}

/**
 * 5. Broadcast Sender Daemon
 * Checks for scheduled broadcasts that are ready to send, then loops through all users and sends them.
 */
async function watchBroadcasts() {
  console.log('[WATCHER] Checking for pending broadcasts...');
  try {
    const now = new Date().toISOString();
    
    // Select broadcasts that are pending and (scheduled_at is null OR <= now)
    const { data: broadcasts, error } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('status', 'pending')
      .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
      .order('created_at', { ascending: true });

    if (error) {
      if (error.code === '42P01') return; // Table not created yet
      throw error;
    }
    
    if (!broadcasts || broadcasts.length === 0) return;

    for (const bc of broadcasts) {
      console.log(`[WATCHER] Starting broadcast ${bc.id}...`);
      
      // Update status to sending to prevent double sending
      await supabase.from('broadcasts').update({ status: 'sending' }).eq('id', bc.id);

      // Get all users from users table
      const { data: users, error: userErr } = await supabase.from('users').select('id, telegram_id');
      if (userErr) {
        await supabase.from('broadcasts').update({ status: 'failed', error_message: userErr.message }).eq('id', bc.id);
        continue;
      }

      if (!users || users.length === 0) {
        await supabase.from('broadcasts').update({ status: 'sent', sent_count: 0 }).eq('id', bc.id);
        continue;
      }

      let sentCount = 0;
      let failedCount = 0;
      
      for (const u of users) {
        if (!u.telegram_id) continue;
        
        try {
          if (!telegramBot) throw new Error('Telegram bot instance not initialized');
          await telegramBot.telegram.sendMessage(u.telegram_id, bc.message, { parse_mode: 'Markdown' });
          sentCount++;

          // Reset delivery failure tracking
          await supabase
            .from('users')
            .update({ last_delivery_failed_at: null, check_prompt_sent_at: null })
            .eq('id', u.id);
        } catch (err) {
          failedCount++;
          console.warn(`[WATCHER WARNING] Failed to send broadcast to user ${u.telegram_id}:`, err.message);

          // Set delivery failure tracking
          await supabase
            .from('users')
            .update({ last_delivery_failed_at: new Date().toISOString() })
            .eq('id', u.id);
        }
        
        // Wait 50ms to respect Telegram rate limits (max 30 msgs/sec)
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Update status to sent
      await supabase
        .from('broadcasts')
        .update({
          status: 'sent',
          sent_count: sentCount,
          error_message: failedCount > 0 ? `${failedCount} deliveries failed.` : null
        })
        .eq('id', bc.id);
      
      console.log(`[WATCHER] Broadcast ${bc.id} complete. Sent to ${sentCount} users, failed for ${failedCount} users.`);
    }
  } catch (err) {
    console.error('[WATCHER ERROR] Error in watchBroadcasts loop:', err.message);
  }
}

/**
 * 6. Failed Delivery Cleanup & Check-Prompt worker
 * Runs periodically to check for users whose last delivery failed:
 * - After 5 days: attempts to send "Bist du noch da ?"
 * - After 14 days: deletes user if they have no active subscription.
 */
async function checkFailedDeliveries() {
  console.log('[WORKER] Running failed delivery checks...');
  try {
    const now = new Date();
    
    // 5-day check prompt
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    const { data: promptUsers, error: promptErr } = await supabase
      .from('users')
      .select('*')
      .not('last_delivery_failed_at', 'is', null)
      .is('check_prompt_sent_at', null)
      .lte('last_delivery_failed_at', fiveDaysAgo.toISOString());
      
    if (promptErr) throw promptErr;
    
    for (const u of promptUsers) {
      console.log(`[WORKER] Sending 'Bist du noch da ?' prompt to user ${u.telegram_id}...`);
      const lang = u.language || 'en';
      const promptMsg = t('broadcast_prompt_active', lang);
      
      try {
        if (!telegramBot) throw new Error('Telegram bot instance not initialized');
        await telegramBot.telegram.sendMessage(u.telegram_id, promptMsg, { parse_mode: 'Markdown' });
        
        // Succeeded! Reset failure flags since they are back
        await supabase
          .from('users')
          .update({ last_delivery_failed_at: null, check_prompt_sent_at: null })
          .eq('id', u.id);
          
        console.log(`[WORKER] User ${u.telegram_id} successfully received prompt. Resetting flags.`);
      } catch (err) {
        // Failed again (which is expected if still blocked)
        // Mark check_prompt_sent_at as sent so we don't spam them, and track 14-day deletion threshold
        await supabase
          .from('users')
          .update({ check_prompt_sent_at: new Date().toISOString() })
          .eq('id', u.id);
          
        console.log(`[WORKER] Prompt delivery failed for user ${u.telegram_id}. check_prompt_sent_at recorded.`);
      }
    }
    
    // 14-day cleanup deletion
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    
    const { data: deleteUsers, error: deleteErr } = await supabase
      .from('users')
      .select('*')
      .not('last_delivery_failed_at', 'is', null)
      .not('check_prompt_sent_at', 'is', null)
      .lte('last_delivery_failed_at', fourteenDaysAgo.toISOString());
      
    if (deleteErr) throw deleteErr;
    
    for (const u of deleteUsers) {
      // Check active subscriptions
      const { count: activeSubsCount, error: subErr } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', u.id)
        .eq('status', 'active');
        
      if (subErr) {
        console.error(`[WORKER ERROR] Failed checking active subscriptions for user ${u.id}:`, subErr.message);
        continue;
      }
      
      if (activeSubsCount === 0) {
        console.log(`[WORKER] Deleting inactive user ${u.telegram_id} due to 14-day delivery failure lockout.`);
        const { error: dropErr } = await supabase.from('users').delete().eq('id', u.id);
        if (dropErr) {
          console.error(`[WORKER ERROR] Failed to delete user ${u.id}:`, dropErr.message);
        }
      } else {
        console.log(`[WORKER] Skipping deletion of user ${u.telegram_id} because they have an active subscription.`);
      }
    }
  } catch (err) {
    if (err.code === '42P01') return; // Table/columns not updated yet
    console.error('[WORKER ERROR] Error in checkFailedDeliveries:', err.message);
  }
}

/**
 * Start all worker loop timers
 */
function startWatcher(botInstance) {
  setBotInstance(botInstance);
  console.log('[WATCHER] Background daemon and workers started.');

  // Run payment checks every 2 minutes (120000 ms)
  setInterval(watchPayments, 120000);
  watchPayments(); // Run immediately

  // Run active upgrades checks every 2 minutes (120000 ms)
  setInterval(watchUpgrades, 120000);
  watchUpgrades(); // Run immediately

  // Run expiration checks every 5 minutes (300000 ms)
  setInterval(checkExpirations, 300000);
  checkExpirations(); // Run immediately

  // Run replacement checks every 5 minutes (300000 ms)
  setInterval(checkReplacements, 300000);
  checkReplacements(); // Run immediately

  // Run broadcast checks every 30 seconds (30000 ms)
  setInterval(watchBroadcasts, 30000);
  watchBroadcasts(); // Run immediately

  // Run failed delivery checks every 10 minutes (600000 ms)
  setInterval(checkFailedDeliveries, 600000);
  checkFailedDeliveries(); // Run immediately
}

module.exports = {
  startWatcher,
  watchPayments,
  watchUpgrades,
  checkExpirations,
  checkReplacements,
  watchBroadcasts,
  checkFailedDeliveries,
};
