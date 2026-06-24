const { supabase } = require('./db');

/**
 * Increment usage count of a coupon in a secure, isolated manner using DB RPC.
 * Returns true if successful, false if coupon is invalid, expired, or limit reached.
 */
async function incrementCouponUses(couponId) {
  if (!couponId) return false;
  try {
    const { data, error } = await supabase
      .rpc('increment_coupon_uses', { coupon_uuid: couponId });
    
    if (error) {
      console.error('[COUPON ERROR] RPC error incrementing coupon count:', error.message);
      return false;
    }
    
    if (data === true) {
      console.log(`[COUPON] Successfully incremented usage count for coupon ID ${couponId}`);
      return true;
    } else {
      console.log(`[COUPON] Failed to increment usage count (limit/expiry reached) for coupon ID ${couponId}`);
      return false;
    }
  } catch (err) {
    console.error('[COUPON ERROR] Failed to increment coupon count:', err.message);
    return false;
  }
}

/**
 * Decrement usage count of a coupon in a secure, isolated manner using DB RPC.
 */
async function decrementCouponUses(couponId) {
  if (!couponId) return;
  try {
    const { error } = await supabase
      .rpc('decrement_coupon_uses', { coupon_uuid: couponId });
    
    if (error) {
      console.error('[COUPON ERROR] RPC error decrementing coupon count:', error.message);
    } else {
      console.log(`[COUPON] Decremented usage count for coupon ID ${couponId}`);
    }
  } catch (err) {
    console.error('[COUPON ERROR] Failed to decrement coupon count:', err.message);
  }
}

module.exports = {
  incrementCouponUses,
  decrementCouponUses
};
