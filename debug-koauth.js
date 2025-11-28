#!/usr/bin/env node
/**
 * Debug script to test KOAuth API key validation
 *
 * Usage: node debug-koauth.js <your-api-key>
 * Example: node debug-koauth.js koa_zXo2l2_xxxx
 */

const apiKey = process.argv[2];

if (!apiKey) {
  console.error('❌ Usage: node debug-koauth.js <api-key>');
  console.error('   Example: node debug-koauth.js koa_zXo2l2_xxxx');
  process.exit(1);
}

const KOAUTH_URL = process.env.KOAUTH_URL || 'https://auth.tillmaessen.de';

console.log('🔍 Testing KOAuth API Key Validation');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📍 KOAuth URL: ${KOAUTH_URL}`);
console.log(`🔑 API Key: ${apiKey.substring(0, 12)}...`);
console.log('');

async function testValidation() {
  try {
    console.log('📤 Sending POST request to /api/validate-key...');
    const response = await fetch(`${KOAUTH_URL}/api/validate-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey }),
      signal: AbortSignal.timeout(10000),
    });

    console.log(`📥 Response Status: ${response.status} ${response.statusText}`);
    console.log(`📋 Response Headers:`);
    console.log(`   Content-Type: ${response.headers.get('content-type')}`);
    console.log('');

    const responseText = await response.text();
    console.log('📄 Raw Response Body:');
    console.log(responseText);
    console.log('');

    let data;
    try {
      data = JSON.parse(responseText);
      console.log('✅ Parsed JSON:');
      console.log(JSON.stringify(data, null, 2));
      console.log('');
    } catch (e) {
      console.error('❌ Failed to parse response as JSON:', e.message);
      return;
    }

    // Check response format
    console.log('🔍 Response Format Analysis:');
    console.log(`   Has 'valid' field: ${data.hasOwnProperty('valid')}`);
    console.log(`   Has 'userId' field: ${data.hasOwnProperty('userId')}`);
    console.log(`   Has 'email' field: ${data.hasOwnProperty('email')}`);
    console.log(`   Has 'error' field: ${data.hasOwnProperty('error')}`);
    console.log('');

    if (data.valid === true) {
      console.log('✅ API Key is VALID');
      console.log(`   User ID: ${data.userId}`);
      console.log(`   Email: ${data.email}`);
      console.log('');
      console.log('🎉 Authentication should work with this key!');
    } else if (data.valid === false) {
      console.log('❌ API Key is INVALID');
      console.log(`   Error: ${data.error || 'Unknown error'}`);
      console.log('');
      console.log('⚠️  This key will not work for authentication.');
      console.log('   Please create a new API key in KOAuth.');
    } else {
      console.log('⚠️  Unexpected response format!');
      console.log('   Expected: { valid: true/false, userId, email }');
      console.log(`   Received: ${JSON.stringify(data)}`);
    }

  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error('');

    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      console.error('⚠️  Request timed out. Possible issues:');
      console.error('   - KOAuth service is down');
      console.error('   - Network connectivity problem');
      console.error('   - Firewall blocking requests');
    } else if (error.message.includes('fetch failed')) {
      console.error('⚠️  Connection failed. Possible issues:');
      console.error('   - KOAuth service is not accessible');
      console.error('   - DNS resolution problem');
      console.error('   - SSL/TLS certificate issue');
    }
  }
}

testValidation();
