require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const crypto = require('node:crypto');

async function main() {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/auth_db';
  const p = new PrismaClient();
  const mfa = await p.mfa_secrets.findFirst();
  console.log('Has MFA record:', !!mfa);
  
  const jwt = process.env.JWT_SECRET || 'default-secret';
  console.log('JWT_SECRET first 10:', jwt.substring(0, 10));
  
  const encKey = crypto.createHash('sha256').update(jwt).digest();
  const [ivH, tagH, encH] = mfa.secret_encrypted.split(':');
  const iv = Buffer.from(ivH, 'hex');
  const tag = Buffer.from(tagH, 'hex');
  const enc = Buffer.from(encH, 'hex');
  const d = crypto.createDecipheriv('aes-256-gcm', encKey, iv);
  d.setAuthTag(tag);
  const decrypted = Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  console.log('Decrypted secret:', decrypted);
  console.log('Expected secret:', 'ITRNEDUHDJGDDYA7DOCR6SR3MWFR35RM');
  console.log('Match:', decrypted === 'ITRNEDUHDJGDDYA7DOCR6SR3MWFR35RM');
  
  // Now try to verify a TOTP code
  const { TOTP, NobleCryptoPlugin, ScureBase32Plugin } = require('otplib');
  const totp = new TOTP({ secret: decrypted, crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });
  const token = await totp.generate();
  console.log('Generated TOTP:', token);
  const result = await totp.verify(token);
  console.log('Verify result:', result);
  
  await p.$disconnect();
}
main().catch(console.error);
