import Stripe from "stripe";
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
export const PRICE_IDS = {
  weekly: process.env.STRIPE_PRICE_WEEKLY,
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  yearly: process.env.STRIPE_PRICE_YEARLY,
  superlike: process.env.STRIPE_PRICE_SUPERLIKE_PACK,
  boost: process.env.STRIPE_PRICE_BOOST_PACK,
  premium: process.env.STRIPE_PRICE_PREMIUM_ONETIME,
};
export const PACK_QUANTITIES = {
  superlike: parseInt(process.env.SUPERLIKE_PACK_CREDITS || "5", 10),
  boost: parseInt(process.env.BOOST_PACK_CREDITS || "3", 10),
  premium: parseInt(process.env.PREMIUM_ONETIME_TOKENS || "1", 10),
};

export function toSubView(sub, planRow = null) {
  if (!sub) return { status: "none" };

  const item = sub.items?.data?.[0] || null;
  // prefer price.recurring; fallback to legacy sub.plan
  const price = item?.price || null;
  const interval = price?.recurring?.interval || sub?.plan?.interval || null; // 'day'|'week'|'month'|'year'
  const intervalCount = price?.recurring?.interval_count || sub?.plan?.interval_count || 1;

  // pick an anchor: current_period_start > billing_cycle_anchor > start_date
  const anchorSec =
    (Number.isFinite(sub?.current_period_start) && sub.current_period_start) ||
    (Number.isFinite(sub?.billing_cycle_anchor) && sub.billing_cycle_anchor) ||
    (Number.isFinite(sub?.start_date) && sub.start_date) ||
    null;

  // Stripe may omit current_period_end in Flexible billing. Try it, then trial_end, then compute.
  const cpeSec = Number.isFinite(sub?.current_period_end) ? sub.current_period_end : null;
  const trialEndSec = Number.isFinite(sub?.trial_end) ? sub.trial_end : null;

  let computedEnd = null;
  if (!cpeSec && anchorSec && interval) {
    const add = (ms, n) => {
      const d = new Date(ms);
      if (interval === "day") d.setDate(d.getDate() + n);
      else if (interval === "week") d.setDate(d.getDate() + 7 * n);
      else if (interval === "month") d.setMonth(d.getMonth() + n);
      else if (interval === "year") d.setFullYear(d.getFullYear() + n);
      return d;
    };
    computedEnd = add(anchorSec * 1000, intervalCount);
  }

  const cpeIso = cpeSec
    ? new Date(cpeSec * 1000).toISOString()
    : trialEndSec
      ? new Date(trialEndSec * 1000).toISOString()
      : computedEnd
        ? computedEnd.toISOString()
        : null;

  // Invoice retry time (often null on fresh subs)
  const latestInvoiceObj =
    sub.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
  const retryIso = Number.isFinite(latestInvoiceObj?.next_payment_attempt)
    ? new Date(latestInvoiceObj.next_payment_attempt * 1000).toISOString()
    : null;

  const cancelAtPeriodEnd = !!sub.cancel_at_period_end;
  const willRenew = sub.status === "active" && !cancelAtPeriodEnd;

  // Stripe price naming fallback
  const stripeName = price?.nickname || (price?.product && price.product.name) || null;
  const stripeAmount =
    typeof price?.unit_amount === "number"
      ? price.unit_amount
      : price?.unit_amount_decimal
        ? parseInt(price.unit_amount_decimal, 10)
        : Number.isFinite(sub?.plan?.amount)
          ? sub.plan.amount
          : null;
  const stripeCurrency = price?.currency
    ? String(price.currency).toUpperCase()
    : sub?.plan?.currency
      ? String(sub.plan.currency).toUpperCase()
      : null;

  return {
    // state
    status: sub.status, // active | trialing | past_due | unpaid | canceled | ...
    cancel_at_period_end: cancelAtPeriodEnd,
    paused: !!sub.pause_collection,

    // plan basics
    plan_price_id: price?.id || sub?.plan?.id || null,
    plan_interval: interval,
    plan_interval_count: intervalCount,
    plan_slug: planRow?.plan_slug || null,
    plan_name: planRow?.name || stripeName || planRow?.plan_slug || null,
    plan_amount: planRow?.unit_amount ?? stripeAmount ?? null,
    plan_currency: planRow?.currency ?? stripeCurrency ?? null,

    // entitlements (from local Plan, when available)
    superlikes_per_period: planRow?.superlikes_per_period ?? null,
    superlike_period: planRow?.superlike_period ?? null,
    boosts_per_week: planRow?.boosts_per_week ?? null,
    unlimited_swipes: !!planRow?.unlimited_swipes,
    see_who_liked: !!planRow?.see_who_liked,
    priority_support: !!planRow?.priority_support,
    badge: !!planRow?.badge,

    // dates (ISO)
    current_period_end: cpeIso, // computed when Stripe omits it
    trial_end: trialEndSec ? new Date(trialEndSec * 1000).toISOString() : null,
    next_payment_attempt: retryIso,

    // convenience
    will_renew: willRenew,
    renews_on: willRenew ? cpeIso : null,
    ends_on: cancelAtPeriodEnd ? cpeIso : null,
  };
}
