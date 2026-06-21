// Translation Dictionary for Spotify Premium Upgrade System Bot
// Supporting English (en - default), German (de), and Russian (ru)

const locales = {
  en: {
    menu_book_package: '🛍️ Book Package',
    menu_my_subscriptions: '📂 My Subscriptions',
    menu_support_faq: '❓ Support / FAQ',
    menu_language: '🌐 Language',
    
    start_welcome: '👋 Hello {name}!\n\nWelcome to the *Spotify Premium Upgrade System*.\nHere you can quickly and easily upgrade your existing Spotify account to Premium.\n\nChoose an option below to get started!',
    start_error: '❌ An error occurred. Please try again later.',
    
    packages_title: '🛍️ *Select a Spotify Premium Package:*\n\n',
    packages_duration_one: '1 month',
    packages_duration_multi: '{months} months',
    packages_price: 'Duration: {duration}\n  Price: {price} EUR\n\n',
    packages_book_now_btn: '🟢 Book now: {name} ({price}€)',
    packages_error: '❌ Error loading packages.',
    
    subs_title: '📂 *Your Subscriptions:*',
    subs_empty: '📂 You currently do not have any active or past subscriptions.',
    subs_error: '❌ Error loading your subscriptions.',
    subs_details_btn: '🔵 Show payment details',
    subs_replace_btn: '🟡 Request replacement (Kick/Error)',
    subs_enter_credentials_btn: '🟢 Enter login credentials',
    subs_reenter_credentials_btn: '🟡 Re-enter login credentials',
    
    status_pending_payment: 'Pending payment',
    status_activating: 'Activating / Waiting for credentials',
    status_renewing: 'Replacement processing',
    status_active: 'Active',
    status_expired: 'Expired',
    status_failed: 'Failed',
    
    sub_info_format: '{statusIcon} *Package: {name}*\n• Status: *{status}*\n• Account: `{email}`\n',
    sub_info_expires: '• Expires: {date}\n',
    
    faq_text: `❓ *Support & Frequently Asked Questions (FAQ)*\n\n` +
      `*1. How does the upgrade work?*\n` +
      `After your crypto payment is confirmed, the bot will ask you to enter your Spotify login credentials. The system automatically logs in and adds your account to a Premium Family Plan. Your playlists and music data remain completely untouched!\n\n` +
      `*2. Why do I need to provide a new account if my Premium is terminated early?*\n` +
      `⚠️ *IMPORTANT:* Spotify strictly limits switching family plans to *once per 12 months*. If you are removed from a family, that specific Spotify account cannot join a new family for the next 12 months. You must provide a *new, fresh Spotify account* to receive your replacement.\n` +
      `*Tip:* As compensation for the downtime, we automatically add *48 hours* to your remaining runtime for every valid replacement! 🎁\n\n` +
      `*3. How long does the activation take?*\n` +
      `Litecoin payments are activated after the first confirmation on the blockchain (usually 2–10 minutes). The subsequent automated upgrade process takes about 5–30 minutes.\n\n` +
      `*4. Are there rules for requesting replacements?*\n` +
      `⚠️ *Yes.* Please only request a replacement if your Premium has actually stopped working. Falsely requesting a replacement (e.g. if Premium is still active) will result in a system-side *Flag (Warning)*. Upon receiving *3 Flags*, replacement requests for your key will be permanently blocked.\n\n` +
      `*5. How to contact Support?*\n` +
      `For any issues with your upgrade, please contact our support admin at @redo666redo. Please provide your Order ID or Telegram ID.`,
      
    invoice_generating: '⏳ Generating payment information. Please wait...',
    invoice_text: `💳 *Payment Request for {name}*\n\n` +
      `Please send the exact LTC amount to the address below. The payment is checked automatically every 2 minutes.\n\n` +
      `• *LTC Amount:* \`{amountLtc}\` LTC\n` +
      `• *EUR Value:* {amountEur} EUR\n` +
      `• *LTC Address:* \`{address}\`\n\n` +
      `⏳ The address is reserved until: *{time}*\n` +
      `*IMPORTANT:* Send exactly the requested amount. The invoice expires after the reservation window closes.`,
    invoice_check_btn: '🟢 Check payment now',
    invoice_cancel_btn: '🔴 Cancel payment',
    invoice_internal_error: '❌ Internal system error while booking.',
    
    pay_check_no_tx: '❌ No matching transaction found yet. Please wait a moment and try again.',
    pay_check_detected: '⏳ *Payment detected in blockchain!*\n\nTX Hash: \`{txHash}...\`\nWe are waiting for 1 confirmation. The bot will notify you as soon as the upgrade is ready.',
    pay_check_confirmed: '✅ This invoice has already been paid and confirmed!',
    pay_check_confirmed_success: '✅ *Payment confirmed!* (TX: \`{txHash}...\`)\n\nYour package is ready. Please send me your Spotify login credentials in the format:\n`Email:Password`\n\ne.g.: \`alex@gmail.com:Password123\`',
    pay_check_expired: '❌ This invoice is expired or cancelled.',
    pay_check_error: '❌ Error during payment check.',
    pay_cancel_success: '❌ Payment cancelled. The subscription has been marked as expired.',
    pay_cancel_not_allowed: '⚠️ This invoice cannot be cancelled.',
    pay_cancel_error: '❌ Cancellation failed.',
    
    pay_details_no_invoice: '⚠️ No active unpaid invoice found for this subscription.',
    pay_details_error: '❌ Error retrieving invoice details.',
    
    buy_pkg_not_found: '⚠️ Package not found.',
    buy_rate_api_error: '⚠️ The exchange rate service is currently unavailable. Please try again in a few moments.',
    buy_no_address_free: '⚠️ No free Litecoin payment address in the pool. Please contact support.',
    buy_reservation_error: '⚠️ Reservation error. Please try again.',
    buy_order_creation_error: '❌ Error creating order.',
    buy_invoice_creation_error: '❌ Error creating invoice.',
    
    replace_ask_text: `⚠️ *Request replacement for this subscription?*\n\n` +
      `Only use this option if you were kicked out of the family plan early or your Premium stopped working.\n\n` +
      `*⚠️ IMPORTANT NOTICE:* Falsely requesting a replacement (e.g. if Premium is still active on your account) will result in a system-side Flag (Warning). At 3 Flags, you will be blocked from future replacement requests for this key!\n\n` +
      `*Process:*\n` +
      `1. Your key will be reset.\n` +
      `2. You will be prompted to enter login details for a *NEW* Spotify account.\n\n` +
      `*Compensation:*\n` +
      `As compensation for the interruption, we automatically add *48 hours extra* to your remaining runtime upon successful upgrade! 🎁\n\n` +
      `*IMPORTANT:* Your existing account cannot be upgraded again (Spotify limit: 1 switch per 12 months!).`,
    replace_ask_confirm_btn: '🟢 Yes, request replacement',
    replace_ask_cancel_btn: '🔴 Cancel',
    replace_ask_cancel_msg: 'Process cancelled.',
    
    replace_blocked: `❌ *Action blocked!*\n\n` +
      `You have reached the limit of 3 warnings (Flags) due to abusive replacement requests.\n` +
      `Further replacement requests for this key/account can no longer be processed.`,
    replace_error_still_active: `⚠️ *Replacement failed: Premium still active!*\n\n` +
      `According to the Spotify interface, Premium is still active on your account. You have received a system-side Flag.\n\n` +
      `*Status:* {flags}/3 Flags.\n` +
      `At 3 Flags, you will be blocked from future replacement requests!`,
    replace_confirm_not_active: '⚠️ Only active subscriptions can be reclaimed.',
    replace_started: `♻️ *Replacement process started!*\n\n` +
      `Your key is being reset. We check the status every 5 minutes. As soon as your slot is freed up, we will send you a notification here so you can enter your new Spotify account details.`,
    replace_error: '❌ Replacement request failed.',
    replace_key_not_ready: `⏳ *The key is not ready for use yet.*\n\nUpgrader.cc is releasing the slot. Please wait until you receive a notification from the bot that the key is ready.`,
    
    credentials_prompt: `✏️ *Enter Spotify login credentials*\n\n` +
      `Please send me your Spotify login credentials in the format:\n` +
      `\`Email:Password\`\n\n` +
      `e.g.: \`newaccount@web.com:NewPassword123\``,
    credentials_invalid: '⚠️ Invalid format. Please send your credentials in the format `Email:Password`.',
    credentials_checking: '⏳ Encrypting credentials and starting Premium upgrade at upgrader.cc. Please wait...',
    credentials_received: '✅ Credentials received! We are now adding your account to the family group. This takes about 5–10 minutes. We will notify you once the upgrade is ready!',
    credentials_not_waiting: '❌ Error: This subscription is not currently waiting for credentials.',
    
    key_delay_text: `⚠️ *Upgrade Delay:*\n\n` +
      `Currently, there are no free upgrade keys available. The admin has been notified and will add new keys or perform your upgrade manually shortly.\n\n` +
      `Your credentials have been saved. As soon as a key is ready, the upgrade will be processed.`,
    upgrade_process_running: `🔄 *Upgrade process is running!* (Duration: approx. 5–30 minutes)\n\n` +
      `Your credentials have been encrypted and sent to the system.\n` +
      `The upgrade is running in the background. We are checking the status and will send you a notification here once your Premium upgrade is active! 🎧`,
    
    upgrade_failed_credentials: `❌ *Upgrade failed!*\n\n` +
      `Your Spotify login details (email or password) are incorrect.\n\n` +
      `Please check your password and send your credentials again in the format \`Email:Password\`.`,
    upgrade_failed_family_limit: `❌ *Upgrade failed!*\n\n` +
      `Your Spotify account was already part of a Premium Family plan in the last 12 months.\n\n` +
      `⚠️ *IMPORTANT:* Due to Spotify's limit, you must use a **different (new) Spotify account**. Please create a new account and send the credentials in the format \`Email:Password\`.`,
    upgrade_failed_technical: `⚠️ *Upgrade Delay:*\n\n` +
      `There was a technical issue during activation: \`{error}\`.\n\n` +
      `The support admin has been notified. You can also contact @redo666redo directly.`,
    
    lang_selection_prompt: '🌐 *Select your language / Sprache auswählen / Выберите язык:*',
    lang_changed: '✅ Language changed to English!',
    broadcast_prompt_active: 'Bist du noch da ?',
    text_help: 'Please select an option from the menu or follow the instructions.',
    system_error: '❌ System error processing the upgrade.',
    
    notify_upgrade_success: `🎉 *Spotify Premium is active!*\n\n` +
      `Your Spotify account *{email}* has been successfully upgraded to Premium! 🚀\n\n` +
      `• Package: {pkgName}\n` +
      `• Expiration date: {date}\n` +
      `{compMsg}` +
      `Have fun listening to music! 🎵`,
    notify_upgrade_success_comp: `🎁 *Compensation added:* 48 hours have been added to your remaining runtime!\n`,
    notify_upgrade_failed: `⚠️ *Spotify Upgrade Error*\n\n` +
      `An error occurred while upgrading your Spotify account *{email}*:\n` +
      `\`{error}\`\n\n` +
      `Please check your login details and submit them again using the button below.`,
    notify_expired: `⚠️ *Your Spotify Premium Upgrade has expired!*\n\n` +
      `Your subscription runtime has ended and your account has been removed from the family group.\n\n` +
      `You can book a new upgrade anytime in the main menu using *🛍️ Book Package*!`,
    notify_replace_ready: `♻️ *Replacement key is ready!*\n\n` +
      `Your upgrade key has been successfully reset and released.\n\n` +
      `Please create or acquire a *NEW, FRESH Spotify account* (do not use the old one as it is blocked for 12 months!) and send me your new login credentials in the format:\n` +
      `\`Email:Password\`\n\n` +
      `e.g.: \`newaccount@web.com:NewPassword123\``,
    notify_invoice_expired: '❌ *Payment window expired!*\n\nThe reservation of the Litecoin address for your order has expired. Please create a new booking if needed.'
  },
  de: {
    menu_book_package: '🛍️ Paket buchen',
    menu_my_subscriptions: '📂 Meine Abonnements',
    menu_support_faq: '❓ Support / FAQ',
    menu_language: '🌐 Sprache',
    
    start_welcome: '👋 Hallo {name}!\n\nWillkommen beim *Spotify Premium Upgrade System*.\nHier kannst du deinen bestehenden Spotify-Account schnell und unkompliziert auf Premium upgraden.\n\nWähle unten eine Option aus, um zu starten!',
    start_error: '❌ Ein Fehler ist aufgetreten. Bitte versuche es später noch einmal.',
    
    packages_title: '🛍️ *Wähle ein Spotify Premium Paket aus:*\n\n',
    packages_duration_one: '1 Monat',
    packages_duration_multi: '{months} Monate',
    packages_price: 'Laufzeit: {duration}\n  Preis: {price} EUR\n\n',
    packages_book_now_btn: '🟢 Jetzt buchen: {name} ({price}€)',
    packages_error: '❌ Fehler beim Laden der Pakete.',
    
    subs_title: '📂 *Deine Abonnements:*',
    subs_empty: '📂 Du hast aktuell keine aktiven oder vergangenen Abonnements.',
    subs_error: '❌ Fehler beim Laden deiner Abonnements.',
    subs_details_btn: '🔵 Zahlungsdetails anzeigen',
    subs_replace_btn: '🟡 Ersatz anfragen (Kick/Fehler)',
    subs_enter_credentials_btn: '🟢 Login-Daten eingeben',
    subs_reenter_credentials_btn: '🟡 Daten erneut eingeben',
    
    status_pending_payment: 'Zahlung ausstehend',
    status_activating: 'Wird aktiviert / Wartet auf Daten',
    status_renewing: 'Ersatz wird verarbeitet',
    status_active: 'Aktiv',
    status_expired: 'Abgelaufen',
    status_failed: 'Fehlgeschlagen',
    
    sub_info_format: '{statusIcon} *Paket: {name}*\n• Status: *{status}*\n• Account: `{email}`\n',
    sub_info_expires: '• Läuft ab: {date}\n',
    
    faq_text: `❓ *Support & Häufig gestellte Fragen (FAQ)*\n\n` +
      `*1. Wie funktioniert das Upgrade?*\n` +
      `Nachdem deine Krypto-Zahlung bestätigt wurde, wirst du vom Bot aufgefordert, deine Spotify-Zugangsdaten einzugeben. Das System meldet sich an und fügt deinen Account automatisch einem Premium Family Plan hinzu. Deine Playlist und Musikdaten bleiben erhalten!\n\n` +
      `*2. Warum muss ich einen neuen Account angeben, falls mein Premium vorzeitig beendet wird?*\n` +
      `⚠️ *WICHTIG:* Spotify schränkt den Wechsel von Family-Plänen streng auf *einmal pro 12 Monate* ein. Wenn du aus einer Familie entfernt wirst, kann derselbe Account in den nächsten 12 Monaten keiner neuen Familie mehr beitreten. Du musst in diesem Fall zwingend einen *neuen, frischen Spotify-Account* angeben, um deinen Ersatz zu erhalten.\n` +
      `*Tipp:* Als Kompensation für den Ausfall schreiben wir deiner verbleibenden Laufzeit bei jedem berechtigten Ersatz automatisch *48 Stunden* gut! 🎁\n\n` +
      `*3. Wie lange dauert die Freischaltung?*\n` +
      `Litecoin-Zahlungen werden ab der ersten Bestätigung auf der Blockchain freigeschaltet (normalerweise innerhalb von 2–10 Minuten). Das anschließende automatische Upgrade dauert ca. 5–30 Minuten.\n\n` +
      `*4. Gibt es Regeln für das Anfordern von Ersatz?*\n` +
      `⚠️ *Ja.* Bitte fordere Ersatz nur an, wenn dein Premium tatsächlich nicht mehr funktioniert. Fälschliches Anfordern von Ersatz (z.B. wenn Premium noch aktiv ist) führt zu einem systemseitigen *Flag (Verwarnung)*. Bei *3 Flags* wird die Bearbeitung von Ersatzanfragen für deinen Key dauerhaft gesperrt.\n\n` +
      `*5. Support anfragen:*\n` +
      `Bei Problemen mit deinem Upgrade wende dich bitte an den Support-Admin unter @redo666redo. Gib dabei bitte deine Bestell-ID oder Telegram-ID an.`,
      
    invoice_generating: '⏳ Generiere Zahlungsinformationen. Bitte warten...',
    invoice_text: `💳 *Zahlungsanforderung für {name}*\n\n` +
      `Bitte sende den exakten LTC-Betrag an die unten angegebene Adresse. Die Zahlung wird automatisch alle 2 Minuten überprüft.\n\n` +
      `• *LTC Betrag:* \`{amountLtc}\` LTC\n` +
      `• *EUR Wert:* {amountEur} EUR\n` +
      `• *LTC Adresse:* \`{address}\`\n\n` +
      `⏳ Die Adresse ist reserviert bis: *{time} Uhr*\n` +
      `*WICHTIG:* Sende genau den geforderten Betrag. Nach Ablauf der Reservierung verfällt die Rechnung.`,
    invoice_check_btn: '🟢 Zahlung jetzt prüfen',
    invoice_cancel_btn: '🔴 Zahlung stornieren',
    invoice_internal_error: '❌ Interner Systemfehler beim Buchen.',
    
    pay_check_no_tx: '❌ Noch kein passender Zahlungseingang gefunden. Bitte warte einen Moment und versuche es erneut.',
    pay_check_detected: '⏳ *Zahlung in der Blockchain erkannt!*\n\nTransaktions-Hash: \`{txHash}...\`\nWir warten auf 1 Bestätigung. Der Bot informiert dich sofort, wenn das Upgrade bereit ist.',
    pay_check_confirmed: '✅ Diese Rechnung wurde bereits bezahlt und bestätigt!',
    pay_check_confirmed_success: '✅ *Zahlung bestätigt!* (TX: \`{txHash}...\`)\n\nDein Paket ist nun bereit. Bitte sende mir jetzt deine Spotify-Zugangsdaten im Format:\n`E-Mail:Passwort`\n\nz.B.: \`alex@gmail.com:Passwort123\`',
    pay_check_expired: '❌ Diese Rechnung ist abgelaufen oder storniert.',
    pay_check_error: '❌ Fehler bei der Zahlungsprüfung.',
    pay_cancel_success: '❌ Zahlung storniert. Das Abonnement wurde als abgelaufen markiert.',
    pay_cancel_not_allowed: '⚠️ Diese Rechnung kann nicht storniert werden.',
    pay_cancel_error: '❌ Stornierung fehlgeschlagen.',
    
    pay_details_no_invoice: '⚠️ Keine aktive unbezahlte Rechnung für dieses Abonnement gefunden.',
    pay_details_error: '❌ Fehler beim Abrufen der Rechnungsdaten.',
    
    buy_pkg_not_found: '⚠️ Paket nicht gefunden.',
    buy_rate_api_error: '⚠️ Der Kurs-API-Dienst ist derzeit nicht erreichbar. Bitte versuche es gleich noch einmal.',
    buy_no_address_free: '⚠️ Derzeit ist keine Litecoin-Zahlungsadresse im Pool frei. Bitte wende dich an den Support.',
    buy_reservation_error: '⚠️ Reservierungsfehler. Bitte versuche es erneut.',
    buy_order_creation_error: '❌ Fehler beim Erstellen der Bestellung.',
    buy_invoice_creation_error: '❌ Fehler beim Erstellen der Rechnung.',
    
    replace_ask_text: `⚠️ *Ersatz für dieses Abonnement anfragen?*\n\n` +
      `Nutze diese Option nur, wenn du vorzeitig aus der Family geworfen wurdest oder dein Premium nicht mehr funktioniert.\n\n` +
      `*⚠️ WICHTIGER HINWEIS:* Das fälschliche Anfordern von Ersatz (z.B. wenn Premium auf deinem Account noch aktiv ist) wird systemseitig mit einem Flag (Verwarnung) belegt. Bei 3 Flags wirst du für jegliche zukünftige Ersatzanfragen dieses Keys gesperrt!\n\n` +
      `*Ablauf:*\n` +
      `1. Dein Key wird zurückgesetzt.\n` +
      `2. Du wirst aufgefordert, neue Daten für einen *NEUEN* Spotify-Account eingegeben.\n\n` +
      `*Kompensation:*\n` +
      `Als Entschädigung für den Ausfall schreiben wir deiner verbleibenden Laufzeit bei erfolgreichem Upgrade automatisch *48 Stunden extra* gut! 🎁\n\n` +
      `*WICHTIG:* Dein bestehender Account kann nicht noch einmal geupgradet werden (Spotify-Sperre: 1 Wechsel pro 12 Monate!).`,
    replace_ask_confirm_btn: '🟢 Ja, Ersatz anfordern',
    replace_ask_cancel_btn: '🔴 Abbrechen',
    replace_ask_cancel_msg: 'Vorgang abgebrochen.',
    
    replace_blocked: `❌ *Aktion gesperrt!*\n\n` +
      `Du hast das Limit von 3 Verwarnungen (Flags) wegen missbräuchlicher Ersatzanfragen erreicht.\n` +
      `Weitere Ersatzanfragen für diesen Key/Account können nicht mehr bearbeitet werden.`,
    replace_error_still_active: `⚠️ *Ersatz fehlgeschlagen: Premium noch aktiv!*\n\n` +
      `Laut Spotify-Schnittstelle ist Premium auf deinem Account noch aktiv. Du hast ein systemseitiges Flag erhalten.\n\n` +
      `*Status:* {flags}/3 Flags.\n` +
      `Bei 3 Flags wirst du für weitere Ersatzanfragen gesperrt!`,
    replace_confirm_not_active: '⚠️ Nur aktive Abonnements können reklamiert werden.',
    replace_started: `♻️ *Ersatz-Prozess gestartet!*\n\n` +
      `Dein Key wird zurückgesetzt. Wir prüfen den Status alle 5 Minuten. Sobald dein Slot wieder freigegeben ist, senden wir dir hier eine Benachrichtigung, damit du deine neuen Spotify-Account-Daten eingeben kannst.`,
    replace_error: '❌ Ersatz-Anfrage fehlgeschlagen.',
    replace_key_not_ready: `⏳ *Der Key ist noch nicht wieder einsatzbereit.*\n\nUpgrader.cc gibt den Slot momentan frei. Bitte warte, bis du vom Bot die Benachrichtigung erhältst, dass der Key bereit ist.`,
    
    credentials_prompt: `✏️ Bitte gib deine Spotify-Zugangsdaten im Format \`E-Mail:Passwort\` ein (z.B. \`spotify@mail.com:MeinPasswort123\`).\n\n` +
      `*WICHTIG:* Falls du Ersatz angefordert hast, erstelle zwingend einen *NEUEN* Spotify-Account, da Spotify Accounts nur alle 12 Monate einen Family-Plan wechseln können!`,
    credentials_invalid: '⚠️ Ungültiges Format. Bitte sende deine Daten im Format `E-Mail:Passwort`.',
    credentials_checking: '🔄 Verschlüssele Zugangsdaten und starte Premium-Upgrade bei upgrader.cc. Bitte warten...',
    credentials_received: '✅ Daten empfangen! Wir fügen deinen Account nun der Family-Gruppe hinzu. Das dauert ca. 5–10 Minuten. Wir benachrichtigen dich, sobald das Upgrade fertig ist!',
    credentials_not_waiting: '❌ Fehler: Dieses Abonnement wartet aktuell nicht auf die Eingabe von Zugangsdaten.',
    
    key_delay_text: `⚠️ *Upgrade-Verzögerung:*\n\n` +
      `Aktuell sind keine freien Upgrade-Keys verfügbar. Der Admin wurde benachrichtigt und wird in Kürze neue Keys einpflegen oder dein Upgrade manuell durchführen.\n\n` +
      `Deine Zugangsdaten wurden gespeichert. Sobald ein Key bereitsteht, wird das Upgrade durchgeführt.`,
    upgrade_process_running: `🔄 *Upgrade-Prozess läuft!* (Dauer: ca. 5–30 Minuten)\n\n` +
      `Deine Zugangsdaten wurden verschlüsselt und an das System übertragen.\n` +
      `Das Upgrade wird nun im Hintergrund ausgeführt. Wir überprüfen den Status fortlaufend und senden dir hier eine Benachrichtigung, sobald dein Premium-Upgrade aktiv ist! 🎧`,
    
    upgrade_failed_credentials: `❌ *Upgrade fehlgeschlagen!*\n\n` +
      `Deine Spotify-Zugangsdaten (E-Mail oder Passwort) sind leider falsch.\n\n` +
      `Bitte überprüfe dein Passwort und sende mir deine Daten erneut im Format \`E-Mail:Passwort\`.`,
    upgrade_failed_family_limit: `❌ *Upgrade fehlgeschlagen!*\n\n` +
      `Dein Spotify-Account war in den letzten 12 Monaten bereits Teil einer Premium Family.\n\n` +
      `⚠️ *WICHTIG:* Wegen der Spotify-Sperre musst du einen **anderen (neuen) Spotify-Account** verwenden. Bitte erstelle einen neuen Account und sende mir die Zugangsdaten im Format \`E-Mail:Passwort\`.`,
    upgrade_failed_technical: `⚠️ *Upgrade-Verzögerung:*\n\n` +
      `Es gab ein technisches Problem bei der Aktivierung: \`{error}\`.\n\n` +
      `Der Support-Admin wurde benachrichtigt. Du kannst dich auch direkt an @redo666redo wenden.`,
    
    lang_selection_prompt: '🌐 *Sprache auswählen / Select your language / Выберите язык:*',
    lang_changed: '✅ Sprache auf Deutsch umgestellt!',
    broadcast_prompt_active: 'Bist du noch da ?',
    text_help: 'Bitte wähle eine Option aus dem Menü oder folge den Anweisungen.',
    system_error: '❌ Systemfehler beim Verarbeiten des Upgrades.',
    
    notify_upgrade_success: `🎉 *Spotify Premium ist aktiv!*\n\n` +
      `Dein Spotify-Account *{email}* wurde erfolgreich auf Premium hochgestuft! 🚀\n\n` +
      `• Paket: {pkgName}\n` +
      `• Ablaufdatum: {date}\n` +
      `{compMsg}` +
      `Viel Spaß beim Musik hören! 🎵`,
    notify_upgrade_success_comp: `🎁 *Gutschrift erhalten:* 48 Stunden wurden deiner verbleibenden Laufzeit gutgeschrieben!\n`,
    notify_upgrade_failed: `⚠️ *Fehler beim Spotify Upgrade*\n\n` +
      `Beim Upgrade deines Spotify-Accounts *{email}* ist ein Fehler aufgetreten:\n` +
      `\`{error}\`\n\n` +
      `Bitte überprüfe deine Zugangsdaten und gib sie über den untenstehenden Button erneut ein.`,
    notify_expired: `⚠️ *Dein Spotify Premium Upgrade ist abgelaufen!*\n\n` +
      `Die Laufzeit deines Abonnements ist beendet und dein Account wurde aus der Family-Gruppe entfernt.\n\n` +
      `Du kannst jederzeit im Hauptmenü über *🛍️ Paket buchen* ein neues Upgrade bestellen!`,
    notify_replace_ready: `♻️ *Ersatz-Key ist bereit!*\n\n` +
      `Dein Upgrade-Key wurde erfolgreich zurückgesetzt und freigegeben.\n\n` +
      `Bitte erstelle oder besorge einen *NEUEN, FRISCHEN Spotify-Account* (nicht den alten, da dieser für 12 Monate gesperrt ist!) und sende mir deine neuen Login-Daten im Format:\n` +
      `\`E-Mail:Passwort\`\n\n` +
      `z.B.: \`neueraccount@web.de:NeuesPasswort123\``,
    notify_invoice_expired: '❌ *Zahlungszeitraum abgelaufen!*\n\nDie Reservierung der Litecoin-Adresse für deine Bestellung ist abgelaufen. Bitte erstelle bei Bedarf eine neue Buchung.'
  },
  ru: {
    menu_book_package: '🛍️ Заказать пакет',
    menu_my_subscriptions: '📂 Мои подписки',
    menu_support_faq: '❓ Поддержка / FAQ',
    menu_language: '🌐 Выбор языка',
    
    start_welcome: '👋 Привет, {name}!\n\nДобро пожаловать в *Систему активации Spotify Premium*.\nЗдесь ты можешь быстро и просто обновить свой существующий аккаунт Spotify до Premium.\n\nВыбери опцию ниже, чтобы начать!',
    start_error: '❌ Произошла ошибка. Пожалуйста, попробуйте позже.',
    
    packages_title: '🛍️ *Выберите пакет Spotify Premium:*\n\n',
    packages_duration_one: '1 месяц',
    packages_duration_multi: '{months} месяцев',
    packages_price: 'Срок действия: {duration}\n  Цена: {price} EUR\n\n',
    packages_book_now_btn: '🟢 Заказать: {name} ({price}€)',
    packages_error: '❌ Ошибка при загрузке пакетов.',
    
    subs_title: '📂 *Ваши подписки:*',
    subs_empty: '📂 У вас пока нет активных или прошлых подписок.',
    subs_error: '❌ Ошибка при загрузке ваших подписок.',
    subs_details_btn: '🔵 Показать детали оплаты',
    subs_replace_btn: '🟡 Запросить замену (Вылет/Ошибка)',
    subs_enter_credentials_btn: '🟢 Ввести данные для входа',
    subs_reenter_credentials_btn: '🟡 Повторно ввести данные',
    
    status_pending_payment: 'Ожидает оплаты',
    status_activating: 'Активация / Ожидание данных',
    status_renewing: 'Замена обрабатывается',
    status_active: 'Активно',
    status_expired: 'Истекло',
    status_failed: 'Ошибка',
    
    sub_info_format: '{statusIcon} *Пакет: {name}*\n• Статус: *{status}*\n• Аккаунт: `{email}`\n',
    sub_info_expires: '• Истекает: {date}\n',
    
    faq_text: `❓ *Поддержка и часто задаваемые вопросы (FAQ)*\n\n` +
      `*1. Как работает активация?*\n` +
      `После подтверждения оплаты криптовалютой бот попросит вас ввести учетные данные Spotify. Система автоматически авторизуется и добавит ваш аккаунт в семейную Premium-группу. Ваши плейлисты и музыкальные данные останутся нетронутыми!\n\n` +
      `*2. Почему мне нужно указывать новый аккаунт в случае досрочного прекращения Premium?*\n` +
      `⚠️ *ВАЖНО:* Spotify строго ограничивает смену семейных планов до *одного раза в 12 месяцев*. Если вас удалили из семьи, этот конкретный аккаунт Spotify не сможет присоединиться к новой семье в течение следующих 12 месяцев. Чтобы получить замену, вы должны предоставить *новый, свежий аккаунт Spotify*.\n` +
      `*Совет:* В качестве компенсации за простой мы автоматически добавляем *48 часов* к вашей подписке при каждой обоснованной замене! 🎁\n\n` +
      `*3. Сколько времени занимает активация?*\n` +
      `Платежи Litecoin активируются после первого подтверждения в блокчейне (обычно 2–10 минут). Последующий автоматический процесс обновления занимает около 5–30 минут.\n\n` +
      `*4. Существуют ли правила для запроса замены?*\n` +
      `⚠️ *Да.* Пожалуйста, запрашивайте замену только в том случае, если ваш Premium действительно перестал работать. Ложный запрос замены (например, если Premium еще активен) приведет к системному *Флагу (Предупреждению)*. После получения *3 Флагов* запросы на замену для вашего ключа будут заблокированы навсегда.\n\n` +
      `*5. Как связаться с техподдержкой?*\n` +
      `По любым вопросам активации обращайтесь к нашему администратору поддержки @redo666redo. Пожалуйста, укажите ваш ID заказа или Telegram ID.`,
      
    invoice_generating: '⏳ Генерация информации об оплате. Пожалуйста, подождите...',
    invoice_text: `💳 *Платежный запрос для {name}*\n\n` +
      `Пожалуйста, отправьте точную сумму в LTC на указанный ниже адрес. Платеж проверяется автоматически каждые 2 минуты.\n\n` +
      `• *Сумма LTC:* \`{amountLtc}\` LTC\n` +
      `• *EUR эквивалент:* {amountEur} EUR\n` +
      `• *Адрес LTC:* \`{address}\`\n\n` +
      `⏳ Адрес зарезервирован до: *{time}*\n` +
      `*ВАЖНО:* Отправляйте именно указанную сумму. Инвойс истечет после окончания окна резервирования.`,
    invoice_check_btn: '🟢 Проверить оплату',
    invoice_cancel_btn: '🔴 Отменить оплату',
    invoice_internal_error: '❌ Внутренняя системная ошибка при бронировании.',
    
    pay_check_no_tx: '❌ Соответствующая транзакция пока не найдена. Пожалуйста, подождите немного и попробуйте еще раз.',
    pay_check_detected: '⏳ *Платеж обнаружен в блокчейне!*\n\nХэш транзакции: \`{txHash}...\`\nМы ожидаем 1 подтверждения. Бот уведомит вас, как только активация будет завершена.',
    pay_check_confirmed: '✅ Этот счет уже был оплачен и подтвержден!',
    pay_check_confirmed_success: '✅ *Оплата подтверждена!* (TX: \`{txHash}...\`)\n\nВаш пакет готов. Пожалуйста, отправьте мне учетные данные вашего аккаунта Spotify в формате:\n`Email:Пароль`\n\nнапример: \`alex@gmail.com:Password123\`',
    pay_check_expired: '❌ Этот счет истек или был отменен.',
    pay_check_error: '❌ Ошибка при проверке платежа.',
    pay_cancel_success: '❌ Оплата отменена. Подписка помечена как истекшая.',
    pay_cancel_not_allowed: '⚠️ Этот счет не может быть отменен.',
    pay_cancel_error: '❌ Отмена не удалась.',
    
    pay_details_no_invoice: '⚠️ Активный неоплаченный счет для этой подписки не найден.',
    pay_details_error: '❌ Ошибка при получении деталей счета.',
    
    buy_pkg_not_found: '⚠️ Пакет не найден.',
    buy_rate_api_error: '⚠️ Служба обменного курса временно недоступна. Пожалуйста, попробуйте еще раз через несколько секунд.',
    buy_no_address_free: '⚠️ В пуле нет свободных адресов Litecoin для оплаты. Пожалуйста, свяжитесь с поддержкой.',
    buy_reservation_error: '⚠️ Ошибка резервирования. Пожалуйста, попробуйте еще раз.',
    buy_order_creation_error: '❌ Ошибка при создании заказа.',
    buy_invoice_creation_error: '❌ Ошибка при создании счета.',
    
    replace_ask_text: `⚠️ *Запросить замену для этой подписки?*\n\n` +
      `Используйте эту опцию только в том случае, если вас досрочно удалили из семейного плана или ваш Premium перестал работать.\n\n` +
      `*⚠️ ВАЖНОЕ ПРИМЕЧАНИЕ:* Ложный запрос замены (например, если Premium на вашем аккаунте все еще активен) приведет к системному Флагу (Предупреждению). После 3 Флагов вы будете заблокированы от дальнейших запросов замены по этому ключу!\n\n` +
      `*Процесс:*\n` +
      `1. Ваш ключ будет сброшен.\n` +
      `2. Вам будет предложено ввести учетные данные для *НОВОГО* аккаунта Spotify.\n\n` +
      `*Компенсация:*\n` +
      `В качестве компенсации за простой мы автоматически добавим *48 часов бесплатно* к вашей подписке после успешной активации! 🎁\n\n` +
      `*ВАЖНО:* Ваш существующий аккаунт не может быть обновлен повторно (лимит Spotify: 1 смена в 12 месяцев!).`,
    replace_ask_confirm_btn: '🟢 Да, запросить замену',
    replace_ask_cancel_btn: '🔴 Отмена',
    replace_ask_cancel_msg: 'Процесс отменен.',
    
    replace_blocked: `❌ *Действие заблокировано!*\n\n` +
      `Вы достигли лимита в 3 предупреждения (Флага) из-за злоупотребления запросами замены.\n` +
      `Дальнейшие запросы замены для этого ключа/аккаунта не могут быть обработаны.`,
    replace_error_still_active: `⚠️ *Замена отклонена: Premium все еще активен!*\n\n` +
      `Согласно интерфейсу Spotify, Premium все еще активен на вашем аккаунте. Вы получили системный Флаг.\n\n` +
      `*Статус:* {flags}/3 Флагов.\n` +
      `При достижении 3 Флагов вы будете заблокированы от дальнейших запросов замены!`,
    replace_confirm_not_active: '⚠️ Только активные подписки могут быть отправлены на замену.',
    replace_started: `♻️ *Процесс замены запущен!*\n\n` +
      `Ваш ключ сбрасывается. Мы проверяем статус каждые 5 минут. Как только ваш слот освободится, мы отправим вам уведомление здесь, чтобы вы могли ввести данные нового аккаунта Spotify.`,
    replace_error: '❌ Запрос замены не удался.',
    replace_key_not_ready: `⏳ *Ключ еще не готов к использованию.*\n\nUpgrader.cc освобождает слот. Пожалуйста, подождите, пока вы не получите уведомление от бота, что ключ готов.`,
    
    credentials_prompt: `✏️ *Введите учетные данные Spotify*\n\n` +
      `Пожалуйста, отправьте мне логин и пароль в формате:\n` +
      `\`Email:Пароль\`\n\n` +
      `например: \`newaccount@web.com:NewPassword123\``,
    credentials_invalid: '⚠️ Неверный формат. Пожалуйста, отправьте ваши учетные данные в формате `Email:Пароль`.',
    credentials_checking: '⏳ Проверка данных и запуск процесса активации...',
    credentials_received: '✅ Данные получены! Сейчас мы добавляем ваш аккаунт в семейную группу. Это займет около 5–10 минут. Мы уведомим вас, как только активация будет завершена!',
    credentials_not_waiting: '❌ Ошибка: В настоящее время эта подписка не ожидает ввода данных.',
    
    key_delay_text: `⚠️ *Задержка активации:*\n\n` +
      `В настоящее время нет свободных ключей для активации. Администратор уведомлен и в ближайшее время добавит новые ключи или проведет ваше обновление вручную.\n\n` +
      `Ваши учетные данные сохранены. Как только ключ будет готов, активация будет завершена.`,
    upgrade_process_running: `🔄 *Процесс активации запущен!* (Длительность: около 5–30 минут)\n\n` +
      `Ваши учетные данные зашифрованы и переданы в систему.\n` +
      `Обновление выполняется в фоновом режиме. Мы отслеживаем статус и отправим вам уведомление здесь, как только активация Premium завершится! 🎧`,
    
    upgrade_failed_credentials: `❌ *Ошибка активации!*\n\n` +
      `Учетные данные Spotify (email или пароль) неверны.\n\n` +
      `Пожалуйста, проверьте пароль и отправьте данные повторно в формате \`Email:Пароль\`.`,
    upgrade_failed_family_limit: `❌ *Ошибка активации!*\n\n` +
      `Ваш аккаунт Spotify уже был частью семейной подписки Premium в течение последних 12 месяцев.\n\n` +
      `⚠️ *ВАЖНО:* Из-за ограничений Spotify вы должны использовать **другой (новый) аккаунт Spotify**. Пожалуйста, создайте новый аккаунт и отправьте данные в формате \`Email:Пароль\`.`,
    upgrade_failed_technical: `⚠️ *Задержка активации:*\n\n` +
      `При активации произошла техническая ошибка: \`{error}\`.\n\n` +
      `Администратор поддержки уведомлен. Вы также можете связаться с @redo666redo напрямую.`,
    
    lang_selection_prompt: '🌐 *Выберите язык / Select your language / Sprache auswählen:*',
    lang_changed: '✅ Язык успешно изменен на русский!',
    broadcast_prompt_active: 'Bist du noch da ?',
    text_help: 'Пожалуйста, выберите опцию в меню или следуйте инструкциям.',
    system_error: '❌ Системная ошибка при обработке активации.',
    
    notify_upgrade_success: `🎉 *Spotify Premium активен!*\n\n` +
      `Ваш аккаунт Spotify *{email}* был успешно обновлен до Premium! 🚀\n\n` +
      `• Пакет: {pkgName}\n` +
      `• Срок действия: {date}\n` +
      `{compMsg}` +
      `Приятного прослушивания музыки! 🎵`,
    notify_upgrade_success_comp: `🎁 *Добавлена компенсация:* 48 часов добавлено к сроку действия вашей подписки!\n`,
    notify_upgrade_failed: `⚠️ *Ошибка активации Spotify*\n\n` +
      `При активации вашего аккаунта Spotify *{email}* произошла ошибка:\n` +
      `\`{error}\`\n\n` +
      `Пожалуйста, проверьте учетные данные и отправьте их повторно, нажав кнопку ниже.`,
    notify_expired: `⚠️ *Срок вашей подписки Spotify Premium истек!*\n\n` +
      `Срок действия вашего пакета подошел к концу, и ваш аккаунт был удален из семейной группы.\n\n` +
      `Вы можете заказать новый пакет в любое время в главном меню с помощью *🛍️ Заказать пакет*!`,
    notify_replace_ready: `♻️ *Запасной ключ готов!*\n\n` +
      `Ваш ключ активации был успешно сброшен и освобожден.\n\n` +
      `Пожалуйста, создайте или подготовьте *НОВЫЙ, СВЕЖИЙ аккаунт Spotify* (не используйте старый, так как он заблокирован на 12 месяцев!) и отправьте мне новые учетные данные в формате:\n` +
      `\`Email:Пароль\`\n\n` +
      `например: \`newaccount@web.com:NewPassword123\``,
    notify_invoice_expired: '❌ *Время оплаты истекло!*\n\nРезервирование адреса Litecoin для вашего заказа истекло. Пожалуйста, создайте новый заказ, если это необходимо.'
  }
};

/**
 * Translate a key into the target language with variable replacement.
 * Defaults to English ('en') if target language or translation key is not found.
 * 
 * @param {string} key The translation key
 * @param {string} lang The language code ('en', 'de', 'ru')
 * @param {object} variables Variables to interpolate in the string
 * @returns {string} The localized string
 */
function t(key, lang = 'en', variables = {}) {
  const targetLang = ['en', 'de', 'ru'].includes(lang) ? lang : 'en';
  let text = (locales[targetLang] && locales[targetLang][key]) || (locales['en'] && locales['en'][key]) || key;
  
  // Interpolate variables
  Object.keys(variables).forEach(v => {
    text = text.split(`{${v}}`).join(variables[v]);
  });
  
  return text;
}

module.exports = {
  t,
  locales
};
