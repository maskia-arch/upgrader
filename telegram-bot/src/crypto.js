const crypto = require('crypto');
const config = require('./config');

// Generate 32-byte key from encryptionKey
const KEY = crypto.createHash('sha256').update(String(config.encryptionKey)).digest();
const IV_LENGTH = 16; // AES block size is 16 bytes

/**
 * Encrypt text using AES-256-CBC
 * @param {string} text Plain text to encrypt
 * @returns {string} iv:ciphertext formatted string
 */
function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt text using AES-256-CBC
 * @param {string} cipherText iv:ciphertext formatted string
 * @returns {string|null} Decrypted plain text or null on failure
 */
function decrypt(cipherText) {
  if (!cipherText) return null;
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 2) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('[CRYPTO ERROR] Decryption failed:', error.message);
    return null;
  }
}

module.exports = {
  encrypt,
  decrypt,
};
