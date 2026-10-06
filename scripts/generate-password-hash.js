#!/usr/bin/env node

// Script to generate password hash for ADMIN_PASSWORD_HASH env var

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/generate-password-hash.js <password>');
  process.exit(1);
}

bcrypt.hash(password, 12, (err, hash) => {
  if (err) {
    console.error('Error generating hash:', err);
    process.exit(1);
  }
  
  console.log('\nGenerated password hash:');
  console.log(hash);
  console.log('\nAdd to your .env or Vercel environment variables:');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log('ADMIN_USERNAME=your_username');
  console.log('ADMIN_EMAIL=your_email@example.com');
});
