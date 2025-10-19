import { stripe } from "../utils/stripe.js";
import { Plan } from "../models/index.js";
import { Op } from "sequelize";

const defaultProductId = process.env.STRIPE_DEFAULT_PRODUCT_ID;

export async function syncPlansFromProduct(overrideProductId) {
  const productId = overrideProductId || defaultProductId;
  if (!productId) throw new Error("STRIPE_DEFAULT_PRODUCT_ID is not set");

  const prices = await stripe.prices.list({
    product: productId,
    limit: 100,
    expand: ["data.product"],
  });

  for (const price of prices.data) {
    if (!price.active) continue;

    const md = price.metadata || {};
    const isRecurring = Boolean(price.recurring);

    const plan_type = md.plan_type || (isRecurring ? "subscription" : "one_time");

    let plan_slug =
      md.plan_slug ||
      (isRecurring
        ? price.recurring.interval === "week"
          ? "weekly"
          : price.recurring.interval === "month"
            ? "monthly"
            : price.recurring.interval === "year"
              ? "yearly"
              : null
        : md.credit_type
          ? `${md.credit_type}_pack`
          : null);
    if (!plan_slug) plan_slug = `${price.id}`;

    const grants_chat =
      String(md.grants_chat ?? (isRecurring ? "true" : "false")).toLowerCase() === "true";

    const credit_type = md.credit_type || null;
    const credit_quantity = md.credit_quantity ? parseInt(md.credit_quantity, 10) : 0;
    const sort_order = md.sort_order ? parseInt(md.sort_order, 10) : 0;

    const unit_amount =
      typeof price.unit_amount === "number"
        ? price.unit_amount
        : price.unit_amount_decimal != null
          ? Math.round(Number(price.unit_amount_decimal))
          : 0;

    const currency = (price.currency || "usd").toUpperCase();

    await Plan.upsert({
      product_id: productId,
      price_id: price.id,
      plan_slug,
      name: price.nickname || price.product?.name || plan_slug || "Plan",
      description: price.product?.description || null,
      plan_type,
      interval: isRecurring ? price.recurring.interval : null,
      unit_amount,
      currency,
      grants_chat,
      credit_type,
      credit_quantity,
      // New entitlement metadata from Stripe Price metadata
      superlikes_per_period: md.superlikes_per_period ? parseInt(md.superlikes_per_period, 10) : null,
      superlike_period: md.superlike_period || null,
      boosts_per_week: md.boosts_per_week ? parseInt(md.boosts_per_week, 10) : null,
      unlimited_swipes:
        String(md.unlimited_swipes ?? "false").toLowerCase() === "true",
      see_who_liked: String(md.see_who_liked ?? "false").toLowerCase() === "true",
      priority_support:
        String(md.priority_support ?? "false").toLowerCase() === "true",
      badge: String(md.badge ?? "false").toLowerCase() === "true",
      active: price.active,
      sort_order,
    });
  }

  const activeRemoteIds = prices.data.filter((p) => p.active).map((p) => p.id);
  if (activeRemoteIds.length > 0) {
    await Plan.update(
      { active: false },
      { where: { product_id: productId, price_id: { [Op.notIn]: activeRemoteIds } } },
    );
  }

  return { count: prices.data.length };
}
