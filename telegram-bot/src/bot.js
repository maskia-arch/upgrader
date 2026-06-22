const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const { incrementCouponUses } = require('./coupons');
const { supabase } = require('./db');
const { encrypt, decrypt } = require('./crypto');
const { fetchLtcPrice, checkPayment } = require('./blockchain');
const { upgradeAccount, renewAccount } = require('./upgrader');
const { t } = require('./locales');

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
    // Detect Telegram language code
    let initialLang = 'en';
    const tgLang = ctx.from.language_code || '';
    if (tgLang.startsWith('de')) {
      initialLang = 'de';
    } else if (tgLang.startsWith('ru')) {
      initialLang = 'ru';
    }

    // User does not exist, insert them
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({ telegram_id: telegramId, username, language: initialLang })
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

  // Reset failure flags if they are active again
  if (user.last_delivery_failed_at !== null || user.check_prompt_sent_at !== null) {
    const { data: updatedUser } = await supabase
      .from('users')
      .update({ last_delivery_failed_at: null, check_prompt_sent_at: null })
      .eq('id', user.id)
      .select()
      .single();
    if (updatedUser) user = updatedUser;
  }

  return user;
}

// Main menu layout
const getMainMenu = (lang = 'en') => {
  return Markup.keyboard([
    [t('menu_book_package', lang), t('menu_my_subscriptions', lang)],
    [t('menu_support_faq', lang), t('menu_language', lang)]
  ]).resize();
};

// Start command
bot.start(async (ctx) => {
  try {
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';
    await ctx.reply(
      t('start_welcome', lang, { name: ctx.from.first_name || 'Customer' }),
      { parse_mode: 'Markdown', ...getMainMenu(lang) }
    );
  } catch (error) {
    console.error('[BOT ERROR] Start failed:', error);
    ctx.reply(t('start_error', 'en'));
  }
});

// Main menu text handlers
// Register Bot Commands Menu
bot.telegram.setMyCommands([
  { command: 'start', description: 'Start the bot / Bot starten' },
  { command: 'packages', description: '🛍️ Book Spotify Premium package' },
  { command: 'subscriptions', description: '📂 Show my subscriptions' },
  { command: 'faq', description: '❓ Show Support & FAQ' },
  { command: 'language', description: '🌐 Change language / Sprache ändern' }
]);

// Helper Functions for Common bot views
async function handleShowPackages(ctx) {
  try {
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';
    
    // Check if upgrades are active (we have > 0 usable keys)
    const { count: usableCount, error: countErr } = await supabase
      .from('upgrader_keys')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'usable');

    if (countErr) throw countErr;

    if (!usableCount || usableCount === 0) {
      // 0 keys usable: show out of stock warning with "Ping me" inline button
      return ctx.reply(t('out_of_stock', lang), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(t('ping_btn', lang), 'ping_subscribe')]
        ])
      });
    }

    // Fetch packages
    const { data: packages, error } = await supabase
      .from('packages')
      .select('*')
      .order('price_eur', { ascending: true });

    if (error || !packages || packages.length === 0) {
      return ctx.reply(t('packages_error', lang));
    }

    let msg = t('packages_title', lang);
    const buttons = [];

    packages.forEach(pkg => {
      const durationStr = pkg.duration_months === 1 
        ? t('packages_duration_one', lang) 
        : t('packages_duration_multi', lang, { months: pkg.duration_months });

      msg += t('packages_price', lang, { duration: durationStr, price: pkg.price_eur.toFixed(2) });
      buttons.push([Markup.button.callback(
        t('packages_book_now_btn', lang, { name: pkg.name, price: pkg.price_eur.toFixed(2) }), 
        `buy_${pkg.id}`
      )]);
    });

    await ctx.reply(msg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (err) {
    console.error(err);
    ctx.reply(t('packages_error', 'en'));
  }
}

async function handleShowSubscriptions(ctx) {
  try {
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';
    
    const { data: subs, error } = await supabase
      .from('subscriptions')
      .select('*, packages(name, duration_months)')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (error || !subs || subs.length === 0) {
      return ctx.reply(t('subs_empty', lang), getMainMenu(lang));
    }

    await ctx.reply(t('subs_title', lang), { parse_mode: 'Markdown' });

    for (const sub of subs) {
      let statusIcon = '⏳';
      let statusTxt = sub.status;
      if (sub.status === 'active') { 
        statusIcon = '✅'; 
        statusTxt = t('status_active', lang); 
      }
      else if (sub.status === 'expired') { 
        statusIcon = '❌'; 
        statusTxt = t('status_expired', lang); 
      }
      else if (sub.status === 'pending_payment') { 
        statusIcon = '💳'; 
        statusTxt = t('status_pending_payment', lang); 
      }
      else if (sub.status === 'activating') { 
        statusIcon = '🔄'; 
        statusTxt = t('status_activating', lang); 
      }
      else if (sub.status === 'renewing') { 
        statusIcon = '♻️'; 
        statusTxt = t('status_renewing', lang); 
      }
      else if (sub.status === 'failed') { 
        statusIcon = '⚠️'; 
        statusTxt = t('status_failed', lang); 
      }

      const emailVal = sub.spotify_email || (lang === 'de' ? 'Noch nicht angegeben' : lang === 'ru' ? 'Еще не указан' : 'Not specified yet');

      let subInfo = t('sub_info_format', lang, {
        statusIcon,
        name: sub.packages.name,
        status: statusTxt,
        email: emailVal
      });

      if (sub.expires_at) {
        const formattedDate = new Date(sub.expires_at).toLocaleDateString(lang === 'de' ? 'de-DE' : lang === 'ru' ? 'ru-RU' : 'en-US');
        subInfo += t('sub_info_expires', lang, { date: formattedDate });
      }

      const buttons = [];
      
      if (sub.status === 'pending_payment') {
        buttons.push([Markup.button.callback(t('subs_details_btn', lang), `pay_details_${sub.id}`)]);
      } else if (sub.status === 'active') {
        buttons.push([Markup.button.callback(t('subs_replace_btn', lang), `replace_ask_${sub.id}`)]);
      } else if (sub.status === 'activating') {
        buttons.push([Markup.button.callback(t('subs_enter_credentials_btn', lang), `enter_credentials_${sub.id}`)]);
      } else if (sub.status === 'failed') {
        buttons.push([Markup.button.callback(t('subs_reenter_credentials_btn', lang), `enter_credentials_${sub.id}`)]);
      }

      await ctx.reply(subInfo, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    }
  } catch (err) {
    console.error(err);
    ctx.reply(t('subs_error', 'en'));
  }
}

async function handleShowFAQ(ctx) {
  try {
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';
    await ctx.reply(t('faq_text', lang), { parse_mode: 'Markdown', ...getMainMenu(lang) });
  } catch (err) {
    console.error(err);
  }
}

async function handleShowLanguage(ctx) {
  try {
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';
    await ctx.reply(t('lang_selection_prompt', lang), {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('🇺🇸 English', 'set_lang_en'),
          Markup.button.callback('🇩🇪 Deutsch', 'set_lang_de'),
          Markup.button.callback('🇷🇺 Русский', 'set_lang_ru')
        ]
      ])
    });
  } catch (err) {
    console.error(err);
  }
}

// Command and hears handlers mapping
bot.command(['paket', 'packages', 'buy'], handleShowPackages);
bot.command(['abos', 'subscriptions'], handleShowSubscriptions);
bot.command('faq', handleShowFAQ);
bot.command(['language', 'sprache', 'lang'], handleShowLanguage);

// Multilingual Button listens (hears)
const hearsMap = {
  // English
  '🛍️ Book Package': handleShowPackages,
  '📂 My Subscriptions': handleShowSubscriptions,
  '❓ Support / FAQ': handleShowFAQ,
  '🌐 Language': handleShowLanguage,
  // German
  '🛍️ Paket buchen': handleShowPackages,
  '📂 Meine Abonnements': handleShowSubscriptions,
  '🌐 Sprache': handleShowLanguage,
  // Russian
  '🛍️ Заказать пакет': handleShowPackages,
  '📂 Мои подписки': handleShowSubscriptions,
  '❓ Поддержка / FAQ': handleShowFAQ,
  '🌐 Выбор языка': handleShowLanguage
};

Object.keys(hearsMap).forEach(btnText => {
  bot.hears(btnText, hearsMap[btnText]);
});

// Action: Set Language
bot.action(/^set_lang_(en|de|ru)$/, async (ctx) => {
  const selectedLang = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx);
    
    // Update language in DB
    await supabase
      .from('users')
      .update({ language: selectedLang })
      .eq('id', user.id);

    await ctx.reply(t('lang_changed', selectedLang), getMainMenu(selectedLang));
  } catch (err) {
    console.error('[BOT ERROR] Set language failed:', err);
    ctx.reply('Error updating language / Fehler beim Ändern der Sprache / Ошибка при изменении языка');
  }
});

// Inline Action: Select Package
bot.action(/^buy_(.+)$/, async (ctx) => {
  const packageId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';

    // Perform checkout rate limit / ban checks
    const allowed = await checkCheckoutAllowed(ctx, user, lang);
    if (!allowed) return;

    // Fetch package details
    const { data: pkg, error: pkgError } = await supabase
      .from('packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      return ctx.reply(t('buy_pkg_not_found', lang));
    }

    // Create Subscription in waiting_coupon status
    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .insert({
        user_id: user.id,
        package_id: pkg.id,
        status: 'waiting_coupon'
      })
      .select()
      .single();

    if (subError || !sub) {
      console.error(subError);
      return ctx.reply(t('buy_order_creation_error', lang));
    }

    // Ask user if they have a coupon
    return ctx.reply(t('coupon_ask', lang), {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(t('coupon_enter_btn', lang), `coupon_enter_${sub.id}`)],
        [Markup.button.callback(t('coupon_skip_btn', lang), `coupon_skip_${sub.id}`)]
      ])
    });

    // Send Payment invoice info
    await sendPaymentInvoice(ctx, sub.id, invoice, selectedAddressObj.ltc_address, pkg.name);
  } catch (err) {
    console.error(err);
    ctx.reply(t('invoice_internal_error', 'en'));
  }
});

// Helper function to display payment invoice
async function sendPaymentInvoice(ctx, subId, invoice, address, packageName) {
  const user = await getOrCreateUser(ctx);
  const lang = user.language || 'en';
  
  const timeFormatted = new Date(invoice.expires_at).toLocaleTimeString(lang === 'de' ? 'de-DE' : lang === 'ru' ? 'ru-RU' : 'en-US');
  
  const msg = t('invoice_text', lang, {
    name: packageName,
    amountLtc: invoice.amount_ltc.toFixed(8),
    amountEur: invoice.amount_eur.toFixed(2),
    address: address,
    time: timeFormatted
  });

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(t('invoice_qr_btn', lang), `show_qr_${invoice.id}`)],
    [Markup.button.callback(t('invoice_check_btn', lang), `check_pay_${invoice.id}`)],
    [Markup.button.callback(t('invoice_cancel_btn', lang), `cancel_pay_${invoice.id}`)]
  ]);

  await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
}

// Action: Display Payment Details
bot.action(/^pay_details_(.+)$/, async (ctx) => {
  const subId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';
    
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
      return ctx.reply(t('pay_details_no_invoice', lang));
    }

    await sendPaymentInvoice(
      ctx,
      subId,
      invoice,
      invoice.ltc_addresses.ltc_address,
      invoice.subscriptions.packages.name
    );
  } catch (err) {
    const user = await getOrCreateUser(ctx);
    ctx.reply(t('pay_details_error', user.language || 'en'));
  }
});

// Action: Show QR Code
bot.action(/^show_qr_(.+)$/, async (ctx) => {
  const invoiceId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';

    // Fetch latest invoice details
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*, ltc_addresses(ltc_address)')
      .eq('id', invoiceId)
      .single();

    if (invError || !invoice) {
      return ctx.reply(t('pay_details_error', lang));
    }

    const address = invoice.ltc_addresses?.ltc_address;
    const amount = invoice.amount_ltc.toFixed(8);

    // Create Litecoin payment URI (BIP 21 standard)
    const paymentUri = `litecoin:${address}?amount=${amount}`;
    
    // Generate QR code URL using public qrserver API
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUri)}`;

    // Reply with photo
    await ctx.replyWithPhoto(
      { url: qrUrl },
      {
        caption: t('invoice_qr_caption', lang, {
          amount: amount,
          address: address
        }),
        parse_mode: 'Markdown'
      }
    );
  } catch (err) {
    console.error('[BOT ERROR] Show QR code error:', err);
    const user = await getOrCreateUser(ctx);
    ctx.reply(t('pay_details_error', user.language || 'en'));
  }
});

// Action: Cancel Payment
bot.action(/^cancel_pay_(.+)$/, async (ctx) => {
  const invoiceId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (error || !invoice || invoice.status !== 'unpaid') {
      return ctx.reply(t('pay_cancel_not_allowed', lang));
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
      .update({ status: 'cancelled' })
      .eq('id', invoice.sub_id);

    await ctx.reply(t('pay_cancel_success', lang), getMainMenu(lang));
  } catch (err) {
    const user = await getOrCreateUser(ctx);
    ctx.reply(t('pay_cancel_error', user.language || 'en'));
  }
});

// Action: Coupon Enter
bot.action(/^coupon_enter_(.+)$/, async (ctx) => {
  const subId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';

    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subId)
      .single();

    if (error || !sub || sub.status !== 'waiting_coupon') {
      return ctx.reply(t('buy_order_creation_error', lang));
    }

    await ctx.reply(t('coupon_prompt', lang));
  } catch (err) {
    console.error('[BOT ERROR] Coupon enter action failed:', err);
  }
});

// Action: Coupon Skip
bot.action(/^coupon_skip_(.+)$/, async (ctx) => {
  const subId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';

    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .select('*, packages(*)')
      .eq('id', subId)
      .single();

    if (subErr || !sub || sub.status !== 'waiting_coupon') {
      return ctx.reply(t('buy_order_creation_error', lang));
    }

    const statusMsg = await ctx.reply(t('invoice_generating', lang));
    await proceedWithPayment(ctx, sub, sub.packages, null, statusMsg, lang, user);
  } catch (err) {
    console.error('[BOT ERROR] Coupon skip action failed:', err);
    ctx.reply(t('invoice_internal_error', 'en'));
  }
});

/**
 * Helper to proceed with payment generation (address reservation, LTC calculation, invoice creation).
 * Can be called with or without a coupon.
 */
async function proceedWithPayment(ctx, sub, pkg, coupon, statusMsg, lang, user) {
  let originalPrice = parseFloat(pkg.price_eur);
  let finalPrice = originalPrice;
  let discountDisplay = '';

  if (coupon) {
    if (coupon.discount_type === 'percentage') {
      const discount = originalPrice * (parseFloat(coupon.discount_value) / 100);
      finalPrice = Math.max(0, originalPrice - discount);
      discountDisplay = `${coupon.discount_value}% (${discount.toFixed(2)} EUR)`;
    } else if (coupon.discount_type === 'fixed') {
      finalPrice = Math.max(0, originalPrice - parseFloat(coupon.discount_value));
      discountDisplay = `${coupon.discount_value} EUR`;
    }
  }

  finalPrice = parseFloat(finalPrice.toFixed(2));

  // 0 EUR invoice (100% discount)
  if (finalPrice <= 0) {
    // Check if it is a renewal / extension of an active subscription
    if (sub.renews_subscription_id) {
      const parentId = sub.renews_subscription_id;
      const { data: parentSub, error: parentErr } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', parentId)
        .single();

      if (!parentErr && parentSub && parentSub.status === 'active') {
        console.log(`[BOT] Processing free renewal/extension for parent subscription ${parentId}`);
        
        // Calculate new expires_at
        const baseDate = new Date(parentSub.expires_at);
        baseDate.setMonth(baseDate.getMonth() + pkg.duration_months);
        const newExpiresAtStr = baseDate.toISOString();

        // Calculate percentage-based milestones for the extended subscription
        const activatedAt = new Date(parentSub.activated_at || parentSub.created_at);
        const totalDur = baseDate - activatedAt;
        const elapsed = Date.now() - activatedAt;
        const percent = totalDur > 0 ? elapsed / totalDur : 0;

        const ping_10_sent = percent >= 0.10;
        const ping_50_sent = percent >= 0.50;
        const ping_75_sent = percent >= 0.75;
        const ping_90_sent = percent >= 0.90;

        // Update the new subscription directly to 'active' with parent's details
        await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            key_id: parentSub.key_id,
            spotify_email: parentSub.spotify_email,
            spotify_password_encrypted: parentSub.spotify_password_encrypted,
            activated_at: parentSub.activated_at || parentSub.created_at,
            expires_at: newExpiresAtStr,
            ping_10_sent,
            ping_50_sent,
            ping_75_sent,
            ping_90_sent,
            coupon_id: coupon ? coupon.id : null,
            updated_at: new Date().toISOString()
          })
          .eq('id', sub.id);

        // Expire parent subscription and clear its key so the worker won't release it
        await supabase
          .from('subscriptions')
          .update({
            status: 'expired',
            key_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', parentSub.id);

        // Create confirmed 0-value invoice
        const dummyAddrId = await getDummyOrFirstAddressId();
        await supabase
          .from('invoices')
          .insert({
            sub_id: sub.id,
            ltc_address_id: dummyAddrId,
            amount_eur: 0,
            amount_ltc: 0,
            status: 'confirmed',
            expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
          });

        if (coupon) {
          await incrementCouponUses(coupon.id);
        }

        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);

        // Notify user about extension success
        const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        const localeStr = lang === 'de' ? 'de-DE' : (lang === 'ru' ? 'ru-RU' : 'en-US');
        const dateStr = baseDate.toLocaleString(localeStr, dateOptions);

        return ctx.reply(t('notify_extend_success', lang, {
          pkgName: pkg.name || '',
          date: dateStr
        }), getMainMenu(lang));
      }
    }

    // Normal free activation flow
    const { error: subUpdateErr } = await supabase
      .from('subscriptions')
      .update({
        status: 'activating',
        coupon_id: coupon ? coupon.id : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', sub.id);

    if (subUpdateErr) throw subUpdateErr;

    if (coupon) {
      await incrementCouponUses(coupon.id);
    }

    const dummyAddrId = await getDummyOrFirstAddressId();
    const { error: invErr } = await supabase
      .from('invoices')
      .insert({
        sub_id: sub.id,
        ltc_address_id: dummyAddrId,
        amount_eur: 0,
        amount_ltc: 0,
        status: 'confirmed',
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      });

    if (invErr) console.error('[DB ERROR] Failed to create 0-value invoice:', invErr);

    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
    return ctx.reply(t('coupon_free_confirmed', lang));
  }

  let ltcRate;
  try {
    ltcRate = await fetchLtcPrice();
  } catch (e) {
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
    return ctx.reply(t('buy_rate_api_error', lang));
  }

  const amountLtc = parseFloat((finalPrice / ltcRate).toFixed(8));

  const { data: addresses, error: addrError } = await supabase
    .rpc('rotate_ltc_address'); 
  
  let selectedAddressObj = null;
  if (!addrError && addresses && addresses.length > 0) {
    selectedAddressObj = addresses[0];
  } else {
    const { data: fallbackAddrs, error: fallbackError } = await supabase
      .from('ltc_addresses')
      .select('*')
      .or('is_reserved.eq.false,reserved_until.lt.now()')
      .order('last_used_at', { ascending: true, nullsFirst: true })
      .order('address_index', { ascending: true })
      .limit(1);

    if (fallbackError || !fallbackAddrs || fallbackAddrs.length === 0) {
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
      return ctx.reply(t('buy_no_address_free', lang));
    }

    selectedAddressObj = fallbackAddrs[0];
    
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
      return ctx.reply(t('buy_reservation_error', lang));
    }
  }

  const { error: subUpdateErr } = await supabase
    .from('subscriptions')
    .update({
      status: 'pending_payment',
      coupon_id: coupon ? coupon.id : null,
      updated_at: new Date().toISOString()
    })
    .eq('id', sub.id);

  if (subUpdateErr) {
    console.error(subUpdateErr);
    await supabase.from('ltc_addresses').update({ is_reserved: false, reserved_until: null }).eq('id', selectedAddressObj.id);
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
    return ctx.reply(t('buy_order_creation_error', lang));
  }

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .insert({
      sub_id: sub.id,
      ltc_address_id: selectedAddressObj.id,
      amount_eur: finalPrice,
      amount_ltc: amountLtc,
      status: 'unpaid',
      expires_at: expiresAt
    })
    .select()
    .single();

  if (invError || !invoice) {
    console.error(invError);
    await supabase.from('subscriptions').update({ status: 'waiting_coupon' }).eq('id', sub.id);
    await supabase.from('ltc_addresses').update({ is_reserved: false, reserved_until: null }).eq('id', selectedAddressObj.id);
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
    return ctx.reply(t('buy_invoice_creation_error', lang));
  }

  await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);

  if (coupon) {
    await ctx.reply(t('coupon_applied_success', lang, { discount: discountDisplay }), { parse_mode: 'Markdown' });
  }

  await sendPaymentInvoice(ctx, sub.id, invoice, selectedAddressObj.ltc_address, pkg.name);
}

async function getDummyOrFirstAddressId() {
  const { data } = await supabase.from('ltc_addresses').select('id').limit(1);
  return data && data.length > 0 ? data[0].id : null;
}

// Action: Check Payment Manually
bot.action(/^check_pay_(.+)$/, async (ctx) => {
  const invoiceId = ctx.match[1];
  try {
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';

    await ctx.answerCbQuery();
    
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*, ltc_addresses(ltc_address), subscriptions(coupon_id)')
      .eq('id', invoiceId)
      .single();

    if (error || !invoice) {
      return ctx.reply(t('pay_check_invoice_not_found', lang));
    }

    if (invoice.status === 'confirmed') {
      return ctx.reply(t('pay_check_confirmed', lang));
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

        if (invoice.subscriptions && invoice.subscriptions.coupon_id) {
          await incrementCouponUses(invoice.subscriptions.coupon_id);
        }

        await ctx.reply(
          t('pay_check_confirmed_success', lang, { txHash: check.txHash.substring(0, 10) }),
          { parse_mode: 'Markdown' }
        );
      } else {
        // Detected but unconfirmed
        await supabase
          .from('invoices')
          .update({ status: 'detected', tx_hash: check.txHash })
          .eq('id', invoiceId);

        await ctx.reply(
          t('pay_check_detected', lang, { txHash: check.txHash.substring(0, 16) }),
          { parse_mode: 'Markdown' }
        );
      }
    } else {
      ctx.reply(t('pay_check_no_tx', lang));
    }
  } catch (err) {
    const user = await getOrCreateUser(ctx);
    ctx.reply(t('pay_check_error', user.language || 'en'));
  }
});

/**
 * Helper to validate checkout spam protection rate limits and bans.
 * Returns true if allowed, false if blocked.
 */
async function checkCheckoutAllowed(ctx, user, lang) {
  // 1. Check if user is banned
  if (user.is_banned) {
    await ctx.reply(t('checkout_banned', lang));
    return false;
  }

  // 2. Check if user requires admin decision
  if (user.requires_admin_decision) {
    await ctx.reply(t('checkout_waiting_admin', lang));
    return false;
  }

  // 3. Check if user is currently blocked
  if (user.checkout_blocked_until && new Date(user.checkout_blocked_until) > new Date()) {
    const blockUntil = new Date(user.checkout_blocked_until);
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
    const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
    const timeStr = blockUntil.toLocaleTimeString(lang === 'de' ? 'de-DE' : lang === 'ru' ? 'ru-RU' : 'en-US', timeOptions);
    const dateStr = blockUntil.toLocaleDateString(lang === 'de' ? 'de-DE' : lang === 'ru' ? 'ru-RU' : 'en-US', dateOptions);
    await ctx.reply(t('checkout_blocked', lang, { time: `${dateStr} ${timeStr}` }));
    return false;
  }

  // 4. Count checkouts in last 60 minutes
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: checkoutCount, error: countErr } = await supabase
    .from('subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gt('created_at', oneHourAgo);

  if (countErr) {
    console.error('[SPAM CHECK ERROR] Failed to count checkouts:', countErr.message);
  } else if (checkoutCount >= 4) {
    // Trigger lockout!
    const blockedUntil = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 hours
    const newLockoutCount = (user.lockout_count || 0) + 1;
    const requiresDecision = newLockoutCount >= 3;

    await supabase
      .from('users')
      .update({
        checkout_blocked_until: blockedUntil.toISOString(),
        lockout_count: newLockoutCount,
        requires_admin_decision: requiresDecision
      })
      .eq('id', user.id);

    // Log spam event
    await supabase.from('system_logs').insert({
      level: requiresDecision ? 'ERROR' : 'INFO',
      component: 'BOT',
      message: `User ${user.telegram_id} locked out from checkout (Spam protection). Lockout count: ${newLockoutCount}`,
      details: { user_id: user.id, lockout_count: newLockoutCount, requires_decision: requiresDecision }
    });

    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
    const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
    const timeStr = blockedUntil.toLocaleTimeString(lang === 'de' ? 'de-DE' : lang === 'ru' ? 'ru-RU' : 'en-US', timeOptions);
    const dateStr = blockedUntil.toLocaleDateString(lang === 'de' ? 'de-DE' : lang === 'ru' ? 'ru-RU' : 'en-US', dateOptions);
    
    if (requiresDecision) {
      await ctx.reply(t('checkout_waiting_admin', lang));
    } else {
      await ctx.reply(t('checkout_blocked', lang, { time: `${dateStr} ${timeStr}` }));
    }
    return false;
  }

  return true;
}

// Action: Handle Satisfaction Feedback Rating Click
bot.action(/^rate_(.+)_(\d+)$/, async (ctx) => {
  const subId = ctx.match[1];
  const rating = parseInt(ctx.match[2]);
  try {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';

    // Check if feedback already exists for this subscription to prevent spamming/tampering
    const { data: existingFeedback, error: checkErr } = await supabase
      .from('feedback')
      .select('id')
      .eq('subscription_id', subId)
      .limit(1);

    if (checkErr) throw checkErr;

    if (existingFeedback && existingFeedback.length > 0) {
      return ctx.reply(t('milestone_10_already_rated', lang));
    }

    // Insert feedback
    const { error: insertErr } = await supabase
      .from('feedback')
      .insert({
        user_id: user.id,
        subscription_id: subId,
        rating: rating
      });

    if (insertErr) throw insertErr;

    // Create star representation for visual excellence
    const stars = '⭐'.repeat(rating);

    // Update text and remove inline keyboard
    const updatedText = `${ctx.callbackQuery.message.text}\n\n*${t('rating_label', lang, { stars })}*\n\n${t('milestone_10_thanks', lang)}`;
    
    await ctx.editMessageText(updatedText, {
      parse_mode: 'Markdown'
    });
  } catch (err) {
    console.error('[BOT ERROR] Feedback rating failed:', err.message);
    ctx.reply(t('start_error', 'en'));
  }
});

// Action: Show renewal package selection menu
bot.action(/^renew_menu_(.+)$/, async (ctx) => {
  const subId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';
    
    // Fetch packages
    const { data: packages, error } = await supabase
      .from('packages')
      .select('*')
      .order('price_eur', { ascending: true });

    if (error || !packages || packages.length === 0) {
      return ctx.reply(t('packages_error', lang));
    }

    let msg = t('packages_title', lang);
    const buttons = [];

    packages.forEach(pkg => {
      const durationStr = pkg.duration_months === 1 
        ? t('packages_duration_one', lang) 
        : t('packages_duration_multi', lang, { months: pkg.duration_months });

      msg += t('packages_price', lang, { duration: durationStr, price: pkg.price_eur.toFixed(2) });
      buttons.push([Markup.button.callback(
        t('packages_book_now_btn', lang, { name: pkg.name, price: pkg.price_eur.toFixed(2) }), 
        `renew_pkg_${subId}_${pkg.id}`
      )]);
    });

    await ctx.reply(msg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (err) {
    console.error('[BOT ERROR] Renew menu failed:', err.message);
    ctx.reply(t('packages_error', 'en'));
  }
});

// Action: Select renewal package and create draft subscription
bot.action(/^renew_pkg_(.+)_(.+)$/, async (ctx) => {
  const parentSubId = ctx.match[1];
  const packageId = ctx.match[2];
  try {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';

    // Perform checkout rate limit / ban checks
    const allowed = await checkCheckoutAllowed(ctx, user, lang);
    if (!allowed) return;

    // Fetch package details
    const { data: pkg, error: pkgError } = await supabase
      .from('packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      return ctx.reply(t('buy_pkg_not_found', lang));
    }

    // Create renewal subscription in waiting_coupon status
    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .insert({
        user_id: user.id,
        package_id: pkg.id,
        renews_subscription_id: parentSubId,
        status: 'waiting_coupon'
      })
      .select()
      .single();

    if (subError || !sub) {
      console.error(subError);
      return ctx.reply(t('buy_order_creation_error', lang));
    }

    // Ask user if they have a coupon
    return ctx.reply(t('coupon_ask', lang), {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(t('coupon_enter_btn', lang), `coupon_enter_${sub.id}`)],
        [Markup.button.callback(t('coupon_skip_btn', lang), `coupon_skip_${sub.id}`)]
      ])
    });
  } catch (err) {
    console.error('[BOT ERROR] Renew package booking failed:', err.message);
    ctx.reply(t('invoice_internal_error', 'en'));
  }
});

// Action: Subscribe to restock ping notifications
bot.action('ping_subscribe', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';

    // Set ping_on_restock to true for this user
    const { error } = await supabase
      .from('users')
      .update({ ping_on_restock: true })
      .eq('id', user.id);

    if (error) throw error;

    await ctx.reply(t('ping_subscribed', lang), { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[BOT ERROR] Failed to subscribe to restock ping:', err.message);
    const user = await getOrCreateUser(ctx);
    await ctx.reply(t('start_error', user.language || 'en'));
  }
});

// Action: Ask Replace (Ersatz anfragen)
bot.action(/^replace_ask_(.+)$/, async (ctx) => {
  const subId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';

    await ctx.reply(
      t('replace_ask_text', lang),
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(t('replace_ask_confirm_btn', lang), `replace_confirm_${subId}`)],
          [Markup.button.callback(t('replace_ask_cancel_btn', lang), 'cancel_replace')]
        ])
      }
    );
  } catch (err) {
    ctx.reply('❌ Error / Fehler / Ошибка');
  }
});

bot.action('cancel_replace', async (ctx) => {
  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx);
  const lang = user.language || 'en';
  await ctx.reply(t('replace_ask_cancel_msg', lang), getMainMenu(lang));
});

// Action: Confirm Replace
bot.action(/^replace_confirm_(.+)$/, async (ctx) => {
  const subId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    
    // Fetch subscription, key, and user info (including flags)
    const { data: sub, error } = await supabase
      .from('subscriptions')
      .select('*, upgrader_keys(api_key), users(flags, telegram_id, language)')
      .eq('id', subId)
      .single();

    if (error || !sub || sub.status !== 'active') {
      const user = await getOrCreateUser(ctx);
      return ctx.reply(t('replace_confirm_not_active', user.language || 'en'));
    }

    const lang = sub.users?.language || 'en';

    // Check if the user is banned due to too many flags
    const currentFlags = (sub.users && sub.users.flags) || 0;
    if (currentFlags >= 3) {
      return ctx.reply(t('replace_blocked', lang));
    }

    let isPremiumActive = false;
    let renewSuccess = true;
    let apiMessage = '';

    // Call upgrader.cc renew/release api first (if key exists)
    if (sub.upgrader_keys && sub.upgrader_keys.api_key) {
      // Decrypt credentials to call renewal
      const decryptedPassword = decrypt(sub.spotify_password_encrypted);
      const renewResult = await renewAccount(sub.upgrader_keys.api_key, sub.spotify_email, decryptedPassword);
      
      if (!renewResult.success) {
        renewSuccess = false;
        apiMessage = renewResult.message || '';
        if (apiMessage.toLowerCase().includes('premium still active')) {
          isPremiumActive = true;
        }
      }
    }

    if (isPremiumActive) {
      // Increment flags
      const newFlags = currentFlags + 1;
      
      // Update flags count in users table
      await supabase
        .from('users')
        .update({ flags: newFlags })
        .eq('id', sub.user_id);

      // Log this incident
      await supabase.from('system_logs').insert({
        level: 'ERROR',
        component: 'API',
        message: `Missbräuchliche Ersatzanfrage (Premium noch aktiv) von User ${sub.user_id}`,
        details: { sub_id: sub.id, key: sub.upgrader_keys?.api_key, current_flags: newFlags }
      });

      return ctx.reply(t('replace_error_still_active', lang, { flags: newFlags }));
    }

    // Set subscription status to renewing
    await supabase
      .from('subscriptions')
      .update({ status: 'renewing', updated_at: new Date().toISOString() })
      .eq('id', subId);

    if (!renewSuccess) {
      console.warn(`[UPGRADER WARNING] Renew request failed: ${apiMessage}`);
      // Log in system logs
      await supabase.from('system_logs').insert({
        level: 'ERROR',
        component: 'API',
        message: `Ersatz-Renew API-Aufruf fehlgeschlagen für Sub ${sub.id}`,
        details: { key: sub.upgrader_keys?.api_key, error: apiMessage }
      });
    }

    await ctx.reply(t('replace_started', lang));
  } catch (err) {
    console.error('[BOT ERROR] Replace confirm error:', err);
    const user = await getOrCreateUser(ctx);
    ctx.reply(t('replace_error', user.language || 'en'));
  }
});

// Action: Enter Credentials
bot.action(/^enter_credentials_(.+)$/, async (ctx) => {
  const subId = ctx.match[1];
  try {
    await ctx.answerCbQuery();
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';
    await ctx.reply(t('credentials_prompt', lang));
  } catch (err) {
    console.error('[BOT ERROR] Enter credentials error:', err);
  }
});

// Regex handler for "email:password" (credentials)
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const match = text.match(/^([^:]+):(.+)$/);

  try {
    const user = await getOrCreateUser(ctx);
    const lang = user.language || 'en';

    // Check if user is in waiting_coupon state
    const { data: couponSub, error: couponSubErr } = await supabase
      .from('subscriptions')
      .select('*, packages(*)')
      .eq('user_id', user.id)
      .eq('status', 'waiting_coupon')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!couponSubErr && couponSub) {
      const code = text.toUpperCase();
      const { data: coupon, error: couponErr } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', code)
        .single();

      const now = new Date();
      const isValid = !couponErr && coupon && 
                      (!coupon.expires_at || new Date(coupon.expires_at) > now) &&
                      (coupon.max_uses === null || coupon.use_count < coupon.max_uses);

      if (!isValid) {
        return ctx.reply(t('coupon_invalid', lang), {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback(t('coupon_retry_btn', lang), `coupon_enter_${couponSub.id}`)],
            [Markup.button.callback(t('coupon_skip_btn', lang), `coupon_skip_${couponSub.id}`)]
          ])
        });
      }

      const statusMsg = await ctx.reply(t('invoice_generating', lang));
      try {
        await proceedWithPayment(ctx, couponSub, couponSub.packages, coupon, statusMsg, lang, user);
      } catch (err) {
        console.error('[BOT ERROR] Failed to apply coupon:', err.message);
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
        ctx.reply(t('invoice_internal_error', lang));
      }
      return;
    }

    if (!match) {
      // Normal text message, reply with main menu instructions
      return ctx.reply(t('text_help', lang), getMainMenu(lang));
    }

    const email = match[1].trim();
    const password = match[2].trim();

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
      return ctx.reply(t('credentials_not_waiting', lang), getMainMenu(lang));
    }

    // Check if it is "renewing" and waiting for key release
    if (sub.status === 'renewing') {
      // We must check if the key is usable in the database first.
      // If the worker has not marked it as usable (meaning upgrader.cc is still processing the release), we reject credentials.
      if (sub.upgrader_keys && sub.upgrader_keys.status !== 'usable') {
        return ctx.reply(t('replace_key_not_ready', lang));
      }
    }

    const waitMsg = await ctx.reply(t('credentials_checking', lang));

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

        return ctx.reply(t('key_delay_text', lang), getMainMenu(lang));
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

      await ctx.reply(t('upgrade_process_running', lang), getMainMenu(lang));
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
        await ctx.reply(t('upgrade_failed_credentials', lang));
      } else if (isFamilyLimitError) {
        await ctx.reply(t('upgrade_failed_family_limit', lang));
      } else {
        await ctx.reply(t('upgrade_failed_technical', lang, { error: upgradeRes.message }));
      }
    }
  } catch (err) {
    console.error(err);
    try {
      const user = await getOrCreateUser(ctx);
      ctx.reply(t('system_error', user.language || 'en'));
    } catch (e) {
      ctx.reply(t('system_error', 'en'));
    }
  }
});

module.exports = {
  bot,
};
