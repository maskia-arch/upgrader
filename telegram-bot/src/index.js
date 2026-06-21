const { bot } = require('./bot');
const { startWatcher } = require('./watcher');

async function main() {
  console.log('[SYSTEM] Starting Spotify Premium Upgrade Bot...');

  // Start Telegraf Bot
  try {
    await bot.launch();
    console.log('[BOT] Telegram Bot successfully started.');
  } catch (error) {
    console.error('[BOT ERROR] Failed to start Telegram Bot:', error.message);
    process.exit(1);
  }

  // Start Background Watcher & Workers
  startWatcher(bot);

  // Enable graceful stop
  const shutdown = (signal) => {
    console.log(`[SYSTEM] Received ${signal}. Stopping services...`);
    bot.stop(signal);
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(err => {
  console.error('[SYSTEM CRITICAL] Startup crash:', err);
  process.exit(1);
});
