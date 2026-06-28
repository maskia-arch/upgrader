const { fork } = require('child_process');
const path = require('path');

console.log('==================================================');
const timeStr = new Date().toISOString();
console.log(`[SYSTEM] Starting Spotify Premium Upgrade Bot - ${timeStr}`);
console.log('==================================================');

// Fork Telegram Bot & Watcher process
const botProcess = fork(path.join(__dirname, 'telegram-bot/src/index.js'), {
  env: { ...process.env }
});

// Fork Admin Dashboard & Mini App Placeholder process
const adminProcess = fork(path.join(__dirname, 'admin-dashboard/src/index.js'), {
  env: { ...process.env, PORT: process.env.PORT || '3000' }
});

// Graceful shutdown handling
const shutdown = (signal) => {
  console.log(`[SYSTEM] Received ${signal}. Terminating bot and dashboard services...`);
  
  try {
    botProcess.kill(signal);
  } catch (err) {
    console.error('[SYSTEM] Error stopping Telegram Bot:', err.message);
  }
  
  try {
    adminProcess.kill(signal);
  } catch (err) {
    console.error('[SYSTEM] Error stopping Admin Dashboard:', err.message);
  }
  
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Restart/Exit policy: if one goes down, shut down the entire container to trigger Docker/Coolify restart
botProcess.on('exit', (code) => {
  console.log(`[SYSTEM] Telegram Bot process exited with code ${code}`);
  if (code !== 0 && code !== null) {
    console.error('[SYSTEM CRITICAL] Telegram Bot crashed. Initiating shutdown for entire stack...');
    adminProcess.kill('SIGTERM');
    process.exit(code);
  }
});

adminProcess.on('exit', (code) => {
  console.log(`[SYSTEM] Admin Dashboard process exited with code ${code}`);
  if (code !== 0 && code !== null) {
    console.error('[SYSTEM CRITICAL] Admin Dashboard crashed. Initiating shutdown for entire stack...');
    botProcess.kill('SIGTERM');
    process.exit(code);
  }
});
