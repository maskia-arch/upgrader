const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  telegramToken: process.env.TELEGRAM_TOKEN,
  encryptionKey: process.env.ENCRYPTION_KEY,
  upgraderApiKey: process.env.UPGRADER_API_KEY,
  upgraderApiUrl: process.env.UPGRADER_API_URL || 'https://upgrader.cc',
  useMockApi: process.env.USE_MOCK_API === 'true',
};

// Validate required configurations
const missing = [];
if (!config.supabaseUrl) missing.push('SUPABASE_URL');
if (!config.supabaseKey) missing.push('SUPABASE_KEY');
if (!config.telegramToken) missing.push('TELEGRAM_TOKEN');
if (!config.encryptionKey) missing.push('ENCRYPTION_KEY');

if (!config.useMockApi) {
  if (!config.upgraderApiKey) missing.push('UPGRADER_API_KEY');
} else {
  // Use mock values if empty in mock mode
  if (!config.upgraderApiKey) config.upgraderApiKey = 'mock-key';
}

if (missing.length > 0) {
  console.error(`[ERROR] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = config;
