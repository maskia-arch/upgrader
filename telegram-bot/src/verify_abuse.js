const { supabase } = require('./db');
const { encrypt, decrypt } = require('./crypto');
const { renewAccount } = require('./upgrader');

process.env.USE_MOCK_API = 'true'; // Enable mock mode for testing upgrader errors safely

async function runTests() {
  console.log('=== STARTING ABUSE PROTECTION VERIFICATION ===');
  
  // 1. Setup mock data
  const testTelegramId = 999123456 + Math.floor(Math.random() * 100000);
  console.log(`Setting up test user with Telegram ID: ${testTelegramId}`);
  
  // Create user
  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({ telegram_id: testTelegramId, username: 'test_abuse_user', flags: 0 })
    .select()
    .single();
    
  if (userError) {
    console.error('Failed to create test user:', userError.message);
    process.exit(1);
  }
  console.log(`Created test user ID: ${user.id}, initial flags: ${user.flags}`);

  // Create package
  const { data: packages, error: pkgError } = await supabase
    .from('packages')
    .select('*')
    .limit(1);
    
  if (pkgError || !packages || packages.length === 0) {
    console.error('No packages found to associate subscription.');
    process.exit(1);
  }
  const pkg = packages[0];

  // Create mock key
  const { data: key, error: keyError } = await supabase
    .from('upgrader_keys')
    .insert({ api_key: `test_api_key_${testTelegramId}`, status: 'active' })
    .select()
    .single();

  if (keyError) {
    console.error('Failed to create mock key:', keyError.message);
    process.exit(1);
  }
  console.log(`Created mock key ID: ${key.id}`);

  // Create subscription
  const { data: sub, error: subError } = await supabase
    .from('subscriptions')
    .insert({
      user_id: user.id,
      package_id: pkg.id,
      key_id: key.id,
      spotify_email: 'still_active_user@test.local', // Trigger 'premium still active' response
      spotify_password_encrypted: encrypt('still_active_pass'),
      status: 'active'
    })
    .select()
    .single();

  if (subError) {
    console.error('Failed to create subscription:', subError.message);
    process.exit(1);
  }
  console.log(`Created subscription ID: ${sub.id}, status: ${sub.status}`);

  // Simulate replace_confirm action handler logic
  async function simulateReplaceConfirm(subscriptionId) {
    console.log(`\n--- Simulating replace_confirm for Sub ID: ${subscriptionId} ---`);
    
    // Fetch subscription, key, and user info (including flags)
    const { data: subDetail, error: detailError } = await supabase
      .from('subscriptions')
      .select('*, upgrader_keys(api_key), users(flags, telegram_id)')
      .eq('id', subscriptionId)
      .single();

    if (detailError || !subDetail || subDetail.status !== 'active') {
      return { success: false, reason: 'Only active subscriptions can be reclaimed or subscription not found.' };
    }

    // Check if the user is banned due to too many flags
    const currentFlags = (subDetail.users && subDetail.users.flags) || 0;
    console.log(`Current user flags: ${currentFlags}`);
    if (currentFlags >= 3) {
      return { success: false, reason: 'Action blocked! Flag limit of 3 exceeded.', flags: currentFlags };
    }

    let isPremiumActive = false;
    let renewSuccess = true;
    let apiMessage = '';

    if (subDetail.upgrader_keys && subDetail.upgrader_keys.api_key) {
      const decryptedPassword = decrypt(subDetail.spotify_password_encrypted);
      const renewResult = await renewAccount(subDetail.upgrader_keys.api_key, subDetail.spotify_email, decryptedPassword);
      
      if (!renewResult.success) {
        renewSuccess = false;
        apiMessage = renewResult.message || '';
        if (apiMessage.toLowerCase().includes('premium still active')) {
          isPremiumActive = true;
        }
      }
    }

    if (isPremiumActive) {
      const newFlags = currentFlags + 1;
      
      // Update flags count in users table
      await supabase
        .from('users')
        .update({ flags: newFlags })
        .eq('id', subDetail.user_id);

      // Log this incident
      await supabase.from('system_logs').insert({
        level: 'ERROR',
        component: 'API',
        message: `Missbräuchliche Ersatzanfrage (Premium noch aktiv) von User ${subDetail.user_id}`,
        details: { sub_id: subDetail.id, key: subDetail.upgrader_keys?.api_key, current_flags: newFlags }
      });

      return { success: false, reason: 'Premium still active (Flag added)', flags: newFlags };
    }

    // Set subscription status to renewing
    await supabase
      .from('subscriptions')
      .update({ status: 'renewing', updated_at: new Date().toISOString() })
      .eq('id', subscriptionId);

    return { success: true, reason: 'Renewal initiated successfully' };
  }

  // --- Run Test Cases ---

  // Test Case 1: First abuse attempt (Flags should go 0 -> 1)
  let result = await simulateReplaceConfirm(sub.id);
  console.log(`Test Case 1 Result:`, result);
  if (result.success || result.flags !== 1 || result.reason !== 'Premium still active (Flag added)') {
    console.error('❌ Test Case 1 Failed: Expected flags to increment to 1 and return abuse reason.');
    await cleanup();
    process.exit(1);
  }
  console.log('✅ Test Case 1 Passed: Flag incremented to 1, subscription remains active.');

  // Test Case 2: Second abuse attempt (Flags should go 1 -> 2)
  result = await simulateReplaceConfirm(sub.id);
  console.log(`Test Case 2 Result:`, result);
  if (result.success || result.flags !== 2) {
    console.error('❌ Test Case 2 Failed: Expected flags to increment to 2.');
    await cleanup();
    process.exit(1);
  }
  console.log('✅ Test Case 2 Passed: Flag incremented to 2, subscription remains active.');

  // Test Case 3: Third abuse attempt (Flags should go 2 -> 3)
  result = await simulateReplaceConfirm(sub.id);
  console.log(`Test Case 3 Result:`, result);
  if (result.success || result.flags !== 3) {
    console.error('❌ Test Case 3 Failed: Expected flags to increment to 3.');
    await cleanup();
    process.exit(1);
  }
  console.log('✅ Test Case 3 Passed: Flag incremented to 3, subscription remains active.');

  // Test Case 4: Fourth attempt - Should block immediately without calling API
  result = await simulateReplaceConfirm(sub.id);
  console.log(`Test Case 4 Result:`, result);
  if (result.success || result.flags !== 3 || !result.reason.includes('blocked')) {
    console.error('❌ Test Case 4 Failed: Expected request to be blocked immediately due to flag limit.');
    await cleanup();
    process.exit(1);
  }
  console.log('✅ Test Case 4 Passed: Action blocked immediately due to 3/3 flags lockout.');

  // Test Case 5: Reset flags to 0 and verify success works
  console.log('\nResetting user flags to 0 and updating email to normal (no abuse)...');
  await supabase.from('users').update({ flags: 0 }).eq('id', user.id);
  await supabase.from('subscriptions').update({ spotify_email: 'normal_upgrade@test.local' }).eq('id', sub.id);

  result = await simulateReplaceConfirm(sub.id);
  console.log(`Test Case 5 Result:`, result);
  if (!result.success) {
    console.error('❌ Test Case 5 Failed: Expected renewal to succeed when flags are < 3 and API returns success.');
    await cleanup();
    process.exit(1);
  }
  
  // Verify subscription status is now 'renewing'
  const { data: updatedSub } = await supabase.from('subscriptions').select('status').eq('id', sub.id).single();
  if (updatedSub.status !== 'renewing') {
    console.error(`❌ Test Case 5 Failed: Expected subscription status to be 'renewing', got: ${updatedSub.status}`);
    await cleanup();
    process.exit(1);
  }
  console.log('✅ Test Case 5 Passed: Renewal succeeded, subscription status set to renewing.');

  // --- Cleanup ---
  await cleanup();
  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');

  async function cleanup() {
    console.log('\nCleaning up test records from database...');
    // Delete logs
    await supabase.from('system_logs').delete().eq('message', `Missbräuchliche Ersatzanfrage (Premium noch aktiv) von User ${user.id}`);
    // Delete subscription
    await supabase.from('subscriptions').delete().eq('id', sub.id);
    // Delete key
    await supabase.from('upgrader_keys').delete().eq('id', key.id);
    // Delete user
    await supabase.from('users').delete().eq('id', user.id);
    console.log('Cleanup completed.');
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
