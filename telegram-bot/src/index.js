const dns = require('dns');
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const { bot } = require('./bot');
const { startWatcher } = require('./watcher');
const { initializeDatabase } = require('./db');

// Register global error handlers to prevent transient crashes in production
process.on('uncaughtException', (err) => {
  console.error('[SYSTEM CRITICAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SYSTEM CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

async function main() {
  console.log('[SYSTEM] Starting Spotify Premium Upgrade Bot...');

  // Await database initialization
  console.log('[SYSTEM] Initializing database schema...');
  await initializeDatabase();
  console.log('[SYSTEM] Database initialization completed successfully.');

  // Start Background Watcher & Workers (runs independently of bot polling launch)
  startWatcher(bot);

  // Start Telegraf Bot
  try {
    await bot.launch();
    console.log('[BOT] Telegram Bot successfully started.');
  } catch (error) {
    console.error('[BOT ERROR] Failed to start Telegram Bot:', error.message);
    console.log('[BOT] Polling failed, but background watcher is active.');
  }

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
