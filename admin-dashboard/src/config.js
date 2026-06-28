const path = require('path');
const fs = require('fs');

const envPaths = [
  path.join(__dirname, '../.env.local'),
  path.join(__dirname, '../env.local'),
  path.join(__dirname, '../.env.local.txt'),
  path.join(__dirname, '../env.local.txt'),
  path.join(__dirname, '../.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    break;
  }
}

// Load bot env for Telegram Token
const botEnvPath = path.join(__dirname, '../../telegram-bot/.env');
if (fs.existsSync(botEnvPath)) {
  require('dotenv').config({ path: botEnvPath });
}

const config = {
  port: process.env.PORT || 8001,
  databaseUrl: process.env.DATABASE_URL,
  encryptionKey: process.env.ENCRYPTION_KEY,
  upgraderApiKey: process.env.UPGRADER_API_KEY,
  upgraderApiUrl: process.env.UPGRADER_API_URL || 'https://upgrader.cc',
  useMockApi: process.env.USE_MOCK_API === 'true',
  telegramToken: process.env.TELEGRAM_TOKEN,
};

// Validate configurations
const missing = [];
if (!config.databaseUrl) missing.push('DATABASE_URL');
if (!config.encryptionKey) missing.push('ENCRYPTION_KEY');

if (!config.useMockApi) {
  if (!config.upgraderApiKey) missing.push('UPGRADER_API_KEY');
} else {
  if (!config.upgraderApiKey) config.upgraderApiKey = 'mock-key';
}

if (missing.length > 0) {
  console.error(`[ERROR] Missing required configurations: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = config;
