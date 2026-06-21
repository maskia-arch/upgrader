const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const { supabase } = require('./db');
const { encrypt, decrypt } = require('./crypto');
const { fetchLtcPrice, checkPayment } = require('./blockchain');
const { upgradeAccount, renewAccount } = require('./upgrader');

const bot = new Telegraf(config.telegramToken);

// Helper: Get or create user in database
async function getOrCreateUser(ctx) {
  const telegramId = ctx.from.id;
  const username = ctx.from.username || null;

  let { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (error && error.code === 'PGRST116') {
    // User does not exist, insert them
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({ telegram_id: telegramId, username })
      .select()
      .single();

    if (insertError) {
      console.error('[DB ERROR] User registration failed:', insertError);
      throw insertError;
    }
    return newUser;
  } else if (error) {
    console.error('[DB ERROR] Fetch user failed:', error);
    throw error;
  }

  // Update username if it changed
  if (user.username !== username) {
    const { data: updatedUser } = await supabase
      .from('users')
      .update({ username })
      .eq('id', user.id)
      .select()
      .single();
    if (updatedUser) user = updatedUser;
  }

  return user;
}

// Main menu layout
const getMainMenu = () => {
  return Markup.keyboard([
    ['🛍️ Paket buchen', '📂 Meine Abonnements'],
    ['❓ Support / FAQ']
  ]).resize();
};

// Start command
bot.start(async (ctx) => {
  try {
    const user = await getOrCreateUser(ctx);
    await ctx.reply(
      `👋 Hallo ${ctx.from.first_name || 'Kunde'}!\n\n` +
      `Willkommen beim *Spotify Premium Upgrade System*.\n` +
      `Hier kannst du deinen bestehenden Spotify-Account schnell und unkompliziert auf Premium upgraden.\n\n` +
      `Wähle unten eine Option aus, um zu starten!`,
      { parse_mode: 'Markdown', ...getMainMenu() }
    );
  } catch (error) {
    ctx.reply('❌ Ein Fehler ist aufgetreten. Bitte versuche es später noch einmal.');
  }
});

// Main menu text handlers
// Register Bot Commands Menu
bot.telegram.setMyCommands([
  { command: 'start', description: 'Startet den Bot und öffnet das Hauptmenü' },
  { command: 'paket', description: '🛍️ Spotify Premium Paket buchen' },
  { command: 'abos', description: '📂 Meine Abonnements anzeigen' },
  { command: 'faq', description: '❓ Support & FAQ anzeigen' }
]);

// Helper Functions for Common bot views
async function handleShowPackages(ctx) {
  try {
    await getOrCreateUser(ctx);
    
    // Fetch packages
    const { data: packages, error } = await supabase
      .from('packages')
      .select('*')
      .order('price_eur', { ascending: true });

    if (error || !packages || packages.length === 0) {
      return ctx.reply('⚠️ Derzeit sind keine Upgrade-Pakete verfügbar. Bitte wende dich an den Support.');
    }

    let msg = '🛍️ *Wähle ein Spotify Premium Paket aus:*\n\n';
    const buttons = [];

    packages.forEach(pkg => {
      msg += `• *${pkg.name}*\n  Laufzeit: ${pkg.duration_months} ${pkg.duration_months === 1 ? 'Monat' : 'Monate'}\n  Preis: ${pkg.price_eur.toFixed(2)} EUR\n\n`;
      buttons.push([Markup.button.callback(`Jetzt buchen: ${pkg.name} (${pkg.price_eur.toFixed(2)}€)`, `buy_${pkg.id}`)]);
    });

    await ctx.reply(msg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (err) {
    ctx.reply('❌ Fehler beim Laden der Pakete.');
  }
}

async function handleShowSubscriptions(ctx) {
  try {
    const user = await getOrCreateUser(ctx);
    
    const { data: subs, error } = await supabase
      .from('subscriptions')
      .select('*, packages(name, duration_months)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error || !subs || subs.length === 0) {
      return ctx.reply('📂 Du hast aktuell keine aktiven oder vergangenen Abonnements.', getMainMenu());
    }

    await ctx.reply('📂 *Deine Abonnements:*', { parse_mode: 'Markdown' });

    for (const sub of subs) {
      let statusIcon = '⏳';
      let statusTxt = sub.status;
      if (sub.status === 'active') { statusIcon = '✅'; statusTxt = 'Aktiv'; }
      else if (sub.status === 'expired') { statusIcon = '❌'; statusTxt = 'Abgelaufen'; }
      else if (sub.status === 'pending_payment') { statusIcon = '💳'; statusTxt = 'Zahlung ausstehend'; }
      else if (sub.status === 'activating') { statusIcon = '🔄'; statusTxt = 'Wird aktiviert / Wartet auf Daten'; }
      else if (sub.status === 'renewing') { statusIcon = '♻️'; statusTxt = 'Ersatz wird verarbeitet'; }
      else if (sub.status === 'failed') { statusIcon = '⚠️'; statusTxt = 'Fehlgeschlagen'; }

      let subInfo = `${statusIcon} *Paket: ${sub.packages.name}*\n` +
        `• Status: *${statusTxt}*\n` +
        `• Account: \`${sub.spotify_email || 'Noch nicht angegeben'}\`\n`;

      if (sub.expires_at) {
        subInfo += `• Läuft ab: ${new Date(sub.expires_at).toLocaleDateString('de-DE')}\n`;
      }

      const buttons = [];
      
      if (sub.status === 'pending_payment') {
        buttons.push([Markup.button.callback('💳 Zahlungsdetails anzeigen', `pay_details_${sub.id}`)]);
      } else if (sub.status === 'active') {
        buttons.push([Markup.button.callback('♻️ Ersatz anfragen (Kick/Fehler)', `replace_ask_${sub.id}`)]);
      } else if (sub.status === 'activating') {
        buttons.push([Markup.button.callback('✏️ Login-Daten eingeben', `enter_credentials_${sub.id}`)]);
      } else if (sub.status === 'failed') {
        buttons.push([Markup.button.callback('🔄 Daten erneut eingeben', `enter_credentials_${sub.id}`)]);
      }

      await ctx.reply(subInfo, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    }
  } catch (err) {
    console.error(err);
    ctx.reply('❌ Fehler beim Laden deiner Abonnements.');
  }
}

async function handleShowFAQ(ctx) {
  const faqText = 
    `❓ *Support & Häufig gestellte Fragen (FAQ)*\n\n` +
    `*1. Wie funktioniert das Upgrade?*\n` +
    `Nachdem deine Krypto-Zahlung bestätigt wurde, wirst du vom Bot aufgefordert, deine Spotify-Zugangsdaten einzugeben. Das System meldet sich an und fügt deinen Account automatisch einem Premium Family Plan hinzu. Deine Playlist und Musikdaten bleiben erhalten!\n\n` +
    `*2. Warum muss ich einen neuen Account angeben, falls mein Premium vorzeitig beendet wird?*\n` +
    `⚠️ *WICHTIG:* Spotify schränkt den Wechsel von Family-Plänen streng auf *einmal pro 12 Monate* ein. Wenn du aus einer Familie entfernt wirst, kann derselbe Account in den nächsten 12 Monaten keiner neuen Familie mehr beitreten. Du musst in diesem Fall zwingend einen *neuen, frischen Spotify-Account* angeben, um deinen Ersatz zu erhalten.\n` +
    `*Tipp:* Als Kompensation für den Ausfall schreiben wir deiner verbleibenden Laufzeit bei jedem berechtigten Ersatz automatisch *48 Stunden* gut! 🎁\n\n` +
    `*3. Wie lange dauert die Freischaltung?*\n` +
    `Litecoin-Zahlungen werden ab der ersten Bestätigung auf der Blockchain freigeschaltet (normalerweise innerhalb von 2–10 Minuten). Das anschließende automatische Upgrade dauert ca. 5–30 Minuten.\n\n` +
    `*4. Support anfragen:*\n` +
    `Bei Problemen mit deinem Upgrade wende dich bitte an den Support-Admin unter @redo666redo. Gib dabei bitte deine Bestell-ID oder Telegram-ID an.`;

  await ctx.reply(faqText, { parse_mode: 'Markdown', ...getMainMenu() });
}

// Command and hears handlers mapping
bot.command('paket', handleShowPackages);
bot.command('abos', handleShowSubscriptions);
bot.command('faq', handleShowFAQ);

bot.hears('🛍️ Paket buchen', handleShowPackages);
bot.hears('📂 Meine Abonnements', handleShowSubscriptions);
bot.hears('❓ Support / FAQ', handleShowFAQ);

// Inline Action: Select Package
bot.action(/^buy_(.+)$/, async (ctx) => {
  const packageId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx);

    // Fetch package details
    const { data: pkg, error: pkgError } = await supabase
      .from('packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      return ctx.reply('⚠️ Paket nicht gefunden.');
    }

    // Inform user of conversion and processing
    const statusMsg = await ctx.reply('⏳ Generiere Zahlungsinformationen. Bitte warten...');

    // 1. Fetch LTC Price
    let ltcRate;
    try {
      ltcRate = await fetchLtcPrice();
    } catch (e) {
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
      return ctx.reply('⚠️ Der Kurs-API-Dienst ist derzeit nicht erreichbar. Bitte versuche es gleich noch einmal.');
    }

    const amountLtc = parseFloat((pkg.price_eur / ltcRate).toFixed(8));

    // 2. Rotate Litecoin Address Pool atomically using transaction logic
    // We execute RPC or query through Supabase directly using PostgreSQL functions or client-side transaction
    // Let's implement client-side transaction logic with SELECT FOR UPDATE SKIP LOCKED
    const { data: addresses, error: addrError } = await supabase
      .rpc('rotate_ltc_address'); 
    
    // Note: To support standard supabase API without RPC setup, let's fall back to standard select/update if RPC is missing
    let selectedAddressObj = null;
    if (!addrError && addresses && addresses.length > 0) {
      selectedAddressObj = addresses[0];
    } else {
      // Client-side fallback if RPC function is not defined on Supabase
      const { data: fallbackAddrs, error: fallbackError } = await supabase
        .from('ltc_addresses')
        .select('*')
        .or('is_reserved.eq.false,reserved_until.lt.now()')
        .order('last_used_at', { ascending: true, nullsFirst: true })
        .order('address_index', { ascending: true })
        .limit(1);

      if (fallbackError || !fallbackAddrs || fallbackAddrs.length === 0) {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
        return ctx.reply('⚠️ Derzeit ist keine Litecoin-Zahlungsadresse im Pool frei. Bitte wende dich an den Support.');
      }

      selectedAddressObj = fallbackAddrs[0];
      
      // Update reservation
      const { error: updateError } = await supabase
        .from('ltc_addresses')
        .update({
          is_reserved: true,
          reserved_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          last_used_at: new Date().toISOString(),
          use_count: selectedAddressObj.use_count + 1
        })
        .eq('id', selectedAddressObj.id);

      if (updateError) {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
        return ctx.reply('⚠️ Reservierungsfehler. Bitte versuche es erneut.');
      }
    }

    // 3. Create Subscription
    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .insert({
        user_id: user.id,
        package_id: pkg.id,
        status: 'pending_payment'
      })
      .select()
      .single();

    if (subError || !sub) {
      console.error(subError);
      // Release address if subscription creation fails
      await supabase
        .from('ltc_addresses')
        .update({ is_reserved: false, reserved_until: null })
        .eq('id', selectedAddressObj.id);

      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
      return ctx.reply('❌ Fehler beim Erstellen der Bestellung.');
    }

    // 4. Create Invoice
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour expiry
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .insert({
        sub_id: sub.id,
        ltc_address_id: selectedAddressObj.id,
        amount_eur: pkg.price_eur,
        amount_ltc: amountLtc,
        status: 'unpaid',
        expires_at: expiresAt
      })
      .select()
      .single();

    if (invError || !invoice) {
      console.error(invError);
      // Clean up
      await supabase.from('subscriptions').delete().eq('id', sub.id);
      await supabase
        .from('ltc_addresses')
        .update({ is_reserved: false, reserved_until: null })
        .eq('id', selectedAddressObj.id);

      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
      return ctx.reply('❌ Fehler beim Erstellen der Rechnung.');
    }

    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);

    // Send Payment invoice info
    await sendPaymentInvoice(ctx, sub.id, invoice, selectedAddressObj.ltc_address, pkg.name);
  } catch (err) {
    console.error(err);
    ctx.reply('❌ Interner Systemfehler beim Buchen.');
  }
});

// Helper function to display payment invoice
async function sendPaymentInvoice(ctx, subId, invoice, address, packageName) {
  const msg = 
    `💳 *Zahlungsanforderung für ${packageName}*\n\n` +
    `Bitte sende den exakten LTC-Betrag an die unten angegebene Adresse. Die Zahlung wird automatisch alle 2 Minuten überprüft.\n\n` +
    `• *LTC Betrag:* \`${invoice.amount_ltc.toFixed(8)}\` LTC\n` +
    `• *EUR Wert:* ${invoice.amount_eur.toFixed(2)} EUR\n` +
    `• *LTC Adresse:* \`${address}\`\n\n` +
    `⏳ Die Adresse ist reserviert bis: *${new Date(invoice.expires_at).toLocaleTimeString('de-DE')} Uhr*\n` +
    `*WICHTIG:* Sende genau den geforderten Betrag. Nach Ablauf der Reservierung verfällt die Rechnung.`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Zahlung jetzt prüfen', `check_pay_${invoice.id}`)],
    [Markup.button.callback('❌ Zahlung stornieren', `cancel_pay_${invoice.id}`)]
  ]);

  if (ctx.callbackQuery) {
    await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
  }
}

// Action: Display Payment Details
bot.action(/^pay_details_(.+)$/, async (ctx) => {
  const subId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    
    // Fetch latest invoice for subscription
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*, ltc_addresses(ltc_address), subscriptions(package_id, packages(name))')
      .eq('sub_id', subId)
      .eq('status', 'unpaid')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (invError || !invoice) {
      return ctx.reply('⚠️ Keine aktive unbezahlte Rechnung für dieses Abonnement gefunden.');
    }

    await sendPaymentInvoice(
      ctx,
      subId,
      invoice,
      invoice.ltc_addresses.ltc_address,
      invoice.subscriptions.packages.name
    );
  } catch (err) {
    ctx.reply('❌ Fehler beim Abrufen der Rechnungsdaten.');
  }
});

// Action: Cancel Payment
bot.action(/^cancel_pay_(.+)$/, async (ctx) => {
  const invoiceId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (error || !invoice || invoice.status !== 'unpaid') {
      return ctx.reply('⚠️ Diese Rechnung kann nicht storniert werden.');
    }

    // Update invoice and release address
    await supabase
      .from('invoices')
      .update({ status: 'expired' })
      .eq('id', invoiceId);

    await supabase
      .from('ltc_addresses')
      .update({ is_reserved: false, reserved_until: null })
      .eq('id', invoice.ltc_address_id);

    await supabase
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('id', invoice.sub_id);

    await ctx.reply('❌ Zahlung storniert. Das Abonnement wurde als abgelaufen markiert.', getMainMenu());
  } catch (err) {
    ctx.reply('❌ Stornierung fehlgeschlagen.');
  }
});

// Action: Check Payment Manually
bot.action(/^check_pay_(.+)$/, async (ctx) => {
  const invoiceId = ctx.match[1];
  try {
    await ctx.answerCbQuery('Prüfe Zahlung...');
    
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*, ltc_addresses(ltc_address)')
      .eq('id', invoiceId)
      .single();

    if (error || !invoice) {
      return ctx.reply('⚠️ Rechnung nicht gefunden.');
    }

    if (invoice.status === 'confirmed') {
      return ctx.reply('✅ Diese Rechnung wurde bereits bezahlt und bestätigt!');
    }

    // Call blockchain check
    const check = await checkPayment(invoice.ltc_addresses.ltc_address, invoice.amount_ltc);

    if (check.found) {
      if (check.confirmed) {
        // Confirm invoice
        await supabase
          .from('invoices')
          .update({ status: 'confirmed', tx_hash: check.txHash })
          .eq('id', invoiceId);

        await supabase
          .from('ltc_addresses')
          .update({ is_reserved: false, reserved_until: null })
          .eq('id', invoice.ltc_address_id);

        await supabase
          .from('subscriptions')
          .update({ status: 'activating' })
          .eq('id', invoice.sub_id);

        await ctx.reply(
          `✅ *Zahlung bestätigt!* (TX: \`${check.txHash.substring(0, 10)}...\`)\n\n` +
          `Dein Paket ist nun bereit. Bitte sende mir jetzt deine Spotify-Zugangsdaten im Format:\n` +
          `\`E-Mail:Passwort\`\n\n` +
          `z.B.: \`alex@gmail.com:Passwort123\``,
          { parse_mode: 'Markdown' }
        );
      } else {
        // Detected but unconfirmed
        await supabase
          .from('invoices')
          .update({ status: 'detected', tx_hash: check.txHash })
          .eq('id', invoiceId);

        await ctx.reply(
          `⏳ *Zahlung in der Blockchain erkannt!*\n\n` +
          `Transaktions-Hash: \`${check.txHash.substring(0, 16)}...\`\n` +
          `Wir warten auf 1 Bestätigung. Der Bot informiert dich sofort, wenn das Upgrade bereit ist.`
        );
      }
    } else {
      ctx.reply('❌ Noch kein passender Zahlungseingang gefunden. Bitte warte einen Moment und versuche es erneut.');
    }
  } catch (err) {
    ctx.reply('❌ Fehler bei der Zahlungsprüfung.');
  }
});

// Action: Ask Replace (Ersatz anfragen)
bot.action(/^replace_ask_(.+)$/, async (ctx) => {
  const subId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    await ctx.reply(
      `⚠️ *Ersatz für dieses Abonnement anfragen?*\n\n` +
      `Nutze diese Option nur, wenn du vorzeitig aus der Family geworfen wurdest oder dein Premium nicht mehr funktioniert.\n\n` +
      `*Ablauf:*\n` +
      `1. Dein Key wird zurückgesetzt.\n` +
      `2. Du wirst aufgefordert, neue Daten für einen *NEUEN* Spotify-Account einzugeben.\n\n` +
      `*Kompensation:*\n` +
      `Als Entschädigung für den Ausfall schreiben wir deiner verbleibenden Laufzeit bei erfolgreichem Upgrade automatisch *48 Stunden extra* gut! 🎁\n\n` +
      `*WICHTIG:* Dein bestehender Account kann nicht noch einmal geupgradet werden (Spotify-Sperre: 1 Wechsel pro 12 Monate!).`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('♻️ Ja, Ersatz anfordern', `replace_confirm_${subId}`)],
          [Markup.button.callback('❌ Abbrechen', 'cancel_replace')]
        ])
      }
    );
  } catch (err) {
    ctx.reply('❌ Fehler.');
  }
});

bot.action('cancel_replace', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Vorgang abgebrochen.', getMainMenu());
});

// Action: Confirm Replace
bot.action(/^replace_confirm_(.+)$/, async (ctx) => {
  const subId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    
    // Fetch subscription
    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('*, upgrader_keys(api_key)')
      .eq('id', subId)
      .single();

    if (error || !sub || sub.status !== 'active') {
      return ctx.reply('⚠️ Nur aktive Abonnements können reklamiert werden.');
    }

    // Set subscription status to renewing
    await supabase
      .from('subscriptions')
      .update({ status: 'renewing', updated_at: new Date().toISOString() })
      .eq('id', subId);

    // Call upgrader.cc renew/release api (if key exists)
    if (sub.upgrader_keys && sub.upgrader_keys.api_key) {
      // Decrypt credentials to call renewal
      const decryptedPassword = decrypt(sub.spotify_password_encrypted);
      const renewResult = await renewAccount(sub.upgrader_keys.api_key, sub.spotify_email, decryptedPassword);
      
      if (!renewResult.success) {
        console.warn(`[UPGRADER WARNING] Renew request failed: ${renewResult.message}`);
        // Log in system logs
        await supabase.from('system_logs').insert({
          level: 'ERROR',
          component: 'API',
          message: `Ersatz-Renew API-Aufruf fehlgeschlagen für Sub ${sub.id}`,
          details: { key: sub.upgrader_keys.api_key, error: renewResult.message }
        });
      }
    }

    await ctx.reply(
      `♻️ *Ersatz-Prozess gestartet!*\n\n` +
      `Dein Key wird zurückgesetzt. Wir prüfen den Status alle 5 Minuten. Sobald dein Slot wieder freigegeben ist, senden wir dir hier eine Benachrichtigung, damit du deine neuen Spotify-Account-Daten eingeben kannst.`
    );
  } catch (err) {
    ctx.reply('❌ Ersatz-Anfrage fehlgeschlagen.');
  }
});

// Action: Enter Credentials
bot.action(/^enter_credentials_(.+)$/, async (ctx) => {
  const subId = ctx.match[1];
  await ctx.answerCbQuery();
  await ctx.reply(
    `✏️ Bitte gib deine Spotify-Zugangsdaten im Format \`E-Mail:Passwort\` ein (z.B. \`spotify@mail.com:MeinPasswort123\`).\n\n` +
    `*WICHTIG:* Falls du Ersatz angefordert hast, erstelle zwingend einen *NEUEN* Spotify-Account, da Spotify Accounts nur alle 12 Monate einen Family-Plan wechseln können!`
  );
});

// Regex handler for "email:password" (credentials)
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const match = text.match(/^([^:]+):(.+)$/);

  if (!match) {
    // Normal text message, reply with main menu instructions
    return ctx.reply('Bitte wähle eine Option aus dem Menü oder folge den Anweisungen.', getMainMenu());
  }

  const email = match[1].trim();
  const password = match[2].trim();

  try {
    const user = await getOrCreateUser(ctx);

    // Find any subscription for this user that is waiting for credentials (status in activating, renewing, failed)
    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('*, packages(duration_months), upgrader_keys(api_key)')
      .eq('user_id', user.id)
      .in('status', ['activating', 'renewing', 'failed'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !sub) {
      return ctx.reply('⚠️ Du hast aktuell kein Abonnement, das auf die Eingabe von Zugangsdaten wartet.', getMainMenu());
    }

    // Check if it is "renewing" and waiting for key release
    if (sub.status === 'renewing') {
      // We must check if the key is usable in the database first.
      // If the worker has not marked it as usable (meaning upgrader.cc is still processing the release), we reject credentials.
      if (sub.upgrader_keys && sub.upgrader_keys.status !== 'usable') {
        return ctx.reply(
          `⏳ *Der Key ist noch nicht wieder einsatzbereit.*\n\n` +
          `Upgrader.cc gibt den Slot momentan frei. Bitte warte, bis du vom Bot die Benachrichtigung erhältst, dass der Key bereit ist.`
        );
      }
    }

    const waitMsg = await ctx.reply('🔄 Verschlüssele Zugangsdaten und starte Premium-Upgrade bei upgrader.cc. Bitte warten...');

    // Encrypt password
    const encryptedPassword = encrypt(password);

    // Update subscription with encrypted password
    await supabase
      .from('subscriptions')
      .update({
        spotify_email: email,
        spotify_password_encrypted: encryptedPassword,
        status: 'activating',
        updated_at: new Date().toISOString()
      })
      .eq('id', sub.id);

    // Find usable key
    let keyObj = null;
    
    if (sub.key_id) {
      // If already has a key (e.g. from activating or replacement), query details
      const { data: existingKey } = await supabase
        .from('upgrader_keys')
        .select('*')
        .eq('id', sub.key_id)
        .single();
      keyObj = existingKey;
    }

    // If no key linked or key is not active/usable, grab a fresh one from the pool
    if (!keyObj || (keyObj.status !== 'usable' && keyObj.status !== 'active')) {
      const { data: freshKeys, error: keyErr } = await supabase
        .from('upgrader_keys')
        .select('*')
        .eq('status', 'usable')
        .limit(1);

      if (keyErr || !freshKeys || freshKeys.length === 0) {
        await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
        
        // Log in system logs
        await supabase.from('system_logs').insert({
          level: 'ERROR',
          component: 'BOT',
          message: `Keine usable Keys im Pool für Bestellung ${sub.id}`,
          details: { sub_id: sub.id, user_id: user.id }
        });

        // Set status to failed
        await supabase
          .from('subscriptions')
          .update({ status: 'failed' })
          .eq('id', sub.id);

        return ctx.reply(
          `⚠️ *Upgrade-Verzögerung:*\n\n` +
          `Aktuell sind keine freien Upgrade-Keys verfügbar. Der Admin wurde benachrichtigt und wird in Kürze neue Keys einpflegen oder dein Upgrade manuell durchführen.\n\n` +
          `Deine Zugangsdaten wurden gespeichert. Sobald ein Key bereitsteht, wird das Upgrade durchgeführt.`,
          getMainMenu()
        );
      }
      
      keyObj = freshKeys[0];
      
      // Link key to subscription
      await supabase
        .from('subscriptions')
        .update({ key_id: keyObj.id })
        .eq('id', sub.id);
    }

    // Trigger upgrade at upgrader.cc
    const upgradeRes = await upgradeAccount(keyObj.api_key, email, password);

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);

    if (upgradeRes.success) {
      // The task was successfully registered at upgrader.cc!
      // Keep status as 'activating' in the database and mark key as active
      await supabase
        .from('upgrader_keys')
        .update({
          status: 'active',
          spotify_account_id: upgradeRes.spotifyAccountId || null,
          error_message: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', keyObj.id);

      await ctx.reply(
        `🔄 *Upgrade-Prozess läuft!* (Dauer: ca. 5–30 Minuten)\n\n` +
        `Deine Zugangsdaten wurden verschlüsselt und an das System übertragen.\n` +
        `Das Upgrade wird nun im Hintergrund ausgeführt. Wir überprüfen den Status fortlaufend und senden dir hier eine Benachrichtigung, sobald dein Premium-Upgrade aktiv ist! 🎧`,
        getMainMenu()
      );
    } else {
      // Failed immediately!
      // Log to system logs
      await supabase.from('system_logs').insert({
        level: 'ERROR',
        component: 'API',
        message: `Upgrader API Upgrade sofort fehlgeschlagen für Sub ${sub.id}`,
        details: { key: keyObj.api_key, error: upgradeRes.message, email }
      });

      const isCredentialError = upgradeRes.message.toLowerCase().includes('password') || 
                                upgradeRes.message.toLowerCase().includes('credential') || 
                                upgradeRes.message.toLowerCase().includes('login') ||
                                upgradeRes.message.toLowerCase().includes('incorrect') ||
                                upgradeRes.message.toLowerCase().includes('invalid account details');
      
      const isFamilyLimitError = upgradeRes.message.toLowerCase().includes('12 months') || 
                                 upgradeRes.message.toLowerCase().includes('family limit') || 
                                 upgradeRes.message.toLowerCase().includes('12 monate') ||
                                 upgradeRes.message.toLowerCase().includes('once per year');

      await supabase
        .from('upgrader_keys')
        .update({
          status: (isCredentialError || isFamilyLimitError) ? 'usable' : 'error',
          error_message: upgradeRes.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', keyObj.id);

      await supabase
        .from('subscriptions')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', sub.id);

      if (isCredentialError) {
        await ctx.reply(
          `❌ *Upgrade fehlgeschlagen!*\n\n` +
          `Deine Spotify-Zugangsdaten (E-Mail oder Passwort) sind leider falsch.\n\n` +
          `Bitte überprüfe dein Passwort und sende mir deine Daten erneut im Format \`E-Mail:Passwort\`.`
        );
      } else if (isFamilyLimitError) {
        await ctx.reply(
          `❌ *Upgrade fehlgeschlagen!*\n\n` +
          `Dein Spotify-Account war in den letzten 12 Monaten bereits Teil einer Premium Family.\n\n` +
          `⚠️ *WICHTIG:* Wegen der Spotify-Sperre musst du einen **anderen (neuen) Spotify-Account** verwenden. Bitte erstelle einen neuen Account und sende mir die Zugangsdaten im Format \`E-Mail:Passwort\`.`
        );
      } else {
        await ctx.reply(
          `⚠️ *Upgrade-Verzögerung:*\n\n` +
          `Es gab ein technisches Problem bei der Aktivierung: \`${upgradeRes.message}\`.\n\n` +
          `Der Support-Admin wurde benachrichtigt. Du kannst dich auch direkt an @redo666redo wenden.`
        );
      }
    }
  } catch (err) {
    console.error(err);
    ctx.reply('❌ Systemfehler beim Verarbeiten des Upgrades.');
  }
});

module.exports = {
  bot,
};
