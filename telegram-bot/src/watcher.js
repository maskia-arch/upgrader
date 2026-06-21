const { supabase } = require('./db');
const { decrypt } = require('./crypto');
const { checkPayment } = require('./blockchain');
const { renewAccount, getKeyInfo } = require('./upgrader');

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
      .select('*, ltc_addresses(ltc_address), subscriptions(user_id, users(telegram_id))')
      .in('status', ['unpaid', 'detected']);

    if (error) throw error;
    if (!invoices || invoices.length === 0) return;

    const now = new Date();

    for (const inv of invoices) {
      const telegramId = inv.subscriptions?.users?.telegram_id;
      const address = inv.ltc_addresses?.ltc_address;
      
      // Handle Expiration
      if (new Date(inv.expires_at) < now) {
        console.log(`[WATCHER] Invoice ${inv.id} expired.`);
        // Update Invoice
        await supabase.from('invoices').update({ status: 'expired' }).eq('id', inv.id);
        // Release address
        await supabase.from('ltc_addresses').update({ is_reserved: false, reserved_until: null }).eq('id', inv.ltc_address_id);
        // Set subscription status
        await supabase.from('subscriptions').update({ status: 'expired' }).eq('id', inv.sub_id);
        
        if (telegramId) {
          await notifyUser(telegramId, `❌ *Zahlungszeitraum abgelaufen!*\n\nDie Reservierung der Litecoin-Adresse für deine Bestellung ist abgelaufen. Bitte erstelle bei Bedarf eine neue Buchung.`);
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
                `✅ *Zahlung bestätigt!*\n\n` +
                `Deine Zahlung von \`${inv.amount_ltc.toFixed(8)}\` LTC wurde erfolgreich verbucht.\n\n` +
                `Bitte sende mir jetzt deine Spotify-Zugangsdaten im Format:\n` +
                `\`E-Mail:Passwort\`\n\n` +
                `z.B.: \`alex@gmail.com:Passwort123\``
              );
            }
          } else if (inv.status === 'unpaid') {
            // Found in mempool, status transitions unpaid -> detected
            console.log(`[WATCHER] Payment DETECTED in mempool for invoice ${inv.id}`);
            
            await supabase.from('invoices').update({ status: 'detected', tx_hash: check.txHash }).eq('id', inv.id);

            if (telegramId) {
              await notifyUser(telegramId, 
                `⏳ *Zahlung in der Blockchain erkannt!*\n\n` +
                `Betrag: \`${inv.amount_ltc.toFixed(8)}\` LTC\n` +
                `Transaktions-Hash: \`${check.txHash.substring(0, 16)}...\`\n` +
                `Wir warten auf 1 Bestätigung. Du wirst benachrichtigt, sobald das Upgrade freigeschaltet wird.`
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
      .select('*, upgrader_keys(api_key), users(telegram_id)')
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
            message: `Key-Freigabe für abgelaufene Subscription fehlgeschlagen`,
            details: { sub_id: sub.id, key: sub.upgrader_keys.api_key, error: renewRes.message }
          });
        }
      }

      if (sub.users && sub.users.telegram_id) {
        await notifyUser(sub.users.telegram_id, 
          `⚠️ *Dein Spotify Premium Upgrade ist abgelaufen!*\n\n` +
          `Die Laufzeit deines Abonnements ist beendet und dein Account wurde aus der Family-Gruppe entfernt.\n\n` +
          `Du kannst jederzeit im Hauptmenü über *🛍️ Paket buchen* ein neues Upgrade bestellen!`
        );
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
      .select('*, upgrader_keys(*), users(telegram_id)')
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
            await notifyUser(sub.users.telegram_id,
              `♻️ *Ersatz-Key ist bereit!*\n\n` +
              `Dein Upgrade-Key wurde erfolgreich zurückgesetzt und freigegeben.\n\n` +
              `Bitte erstelle oder besorge einen *NEUEN, FRISCHEN Spotify-Account* (nicht den alten, da dieser für 12 Monate gesperrt ist!) und sende mir deine neuen Login-Daten im Format:\n` +
              `\`E-Mail:Passwort\`\n\n` +
              `z.B.: \`neueraccount@web.de:NeuesPasswort123\``
            );
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
 * Start all worker loop timers
 */
function startWatcher(botInstance) {
  setBotInstance(botInstance);
  console.log('[WATCHER] Background daemon and workers started.');

  // Run payment checks every 2 minutes (120000 ms)
  setInterval(watchPayments, 120000);
  watchPayments(); // Run immediately

  // Run expiration checks every 5 minutes (300000 ms)
  setInterval(checkExpirations, 300000);
  checkExpirations(); // Run immediately

  // Run replacement checks every 5 minutes (300000 ms)
  setInterval(checkReplacements, 300000);
  checkReplacements(); // Run immediately
}

module.exports = {
  startWatcher,
  watchPayments,
  checkExpirations,
  checkReplacements,
};
