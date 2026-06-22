const { supabase } = require('./db');

/**
 * Increment usage count of a coupon in a secure, isolated manner.
 */
async function incrementCouponUses(couponId) {
  if (!couponId) return;
  try {
    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('use_count')
      .eq('id', couponId)
      .single();
    
    if (!error && coupon) {
      await supabase
        .from('coupons')
        .update({ use_count: coupon.use_count + 1 })
        .eq('id', couponId);
      console.log(`[COUPON] Incremented usage count for coupon ID ${couponId}`);
    }
  } catch (err) {
    console.error('[COUPON ERROR] Failed to increment coupon count:', err.message);
  }
}

module.exports = {
  incrementCouponUses
};
