const crypto = require('crypto');
require('dotenv').config();

// Ensure we have a valid 32-byte key. 
// If the key in .env is not 32 bytes, we hash it to derive a secure 32-byte key.
const rawKey = process.env.ENCRYPTION_KEY || 'default-secret-key-32-chars-long!';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(rawKey).digest();
const PHONE_SALT = process.env.PHONE_SALT || 'default_salt_123';

/**
 * Normalizes phone numbers to a consistent format (digits only).
 * e.g., "+1 (555) 019-2834" -> "15550192834"
 * @param {string} phone 
 * @returns {string}
 */
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Generates a SHA-256 hash of the normalized phone number.
 * Used as a lookup key in the database without revealing the phone number.
 * @param {string} phone 
 * @returns {string}
 */
function hashPhone(phone) {
  const normalized = normalizePhone(phone);
  return crypto
    .createHash('sha256')
    .update(normalized + PHONE_SALT)
    .digest('hex');
}

/**
 * Encrypts clear text using AES-256-GCM.
 * Output is formatted as iv:authTag:encryptedText in hex.
 * @param {string} text 
 * @returns {string}
 */
function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts text encrypted with AES-256-GCM.
 * Returns clear text. If decryption fails, returns original text or empty.
 * @param {string} encryptedText 
 * @returns {string}
 */
function decrypt(encryptedText) {
  if (!encryptedText) return '';
  
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      // Not in the expected encrypted format, return as-is
      return encryptedText;
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error.message);
    return '';
  }
}

module.exports = {
  normalizePhone,
  hashPhone,
  encrypt,
  decrypt
};
