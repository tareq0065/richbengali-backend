import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { stripe, toSubView } from "../utils/stripe.js";
import { Plan, Subscription } from "../models/index.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const s = await Subscription.findOne({ where: { user_id: req.user.id } });
    if (!s?.stripe_subscription_id) {
      return res.json({ data: { status: "none" } });
    }

    // Always fetch live for correct dates and status
    const sub = await stripe.subscriptions.retrieve(String(s.stripe_subscription_id), {
      expand: ["items.data.price.product", "latest_invoice"],
    });

    // Map to local Plan for nicer naming/slug (optional)
    let planRow = null;
    const priceId = sub?.items?.data?.[0]?.price?.id || null;
    if (priceId) {
      planRow = await Plan.findOne({ where: { price_id: priceId, active: true } });
    } else if (s.plan_slug) {
      planRow = await Plan.findOne({ where: { plan_slug: s.plan_slug, active: true } });
    }

    const view = toSubView(sub, planRow);

    // (Optional) lightly persist status/price/interval for analytics/search; leave current_period_end nullable
    await Subscription.update(
      {
        status: view.status,
        plan_price_id: view.plan_price_id,
        plan_interval: view.plan_interval,
        plan_slug: planRow?.plan_slug ?? s.plan_slug ?? null,
      },
      { where: { user_id: req.user.id } },
    );

    return res.json({ data: view });
  } catch (e) {
    next(e);
  }
});

router.post("/cancel", requireAuth, async (req, res, next) => {
  try {
    const { enable } = req.body || {}; // if true => resume auto-renew
    const s = await Subscription.findOne({ where: { user_id: req.user.id } });
    if (!s?.stripe_subscription_id) {
      return res.status(404).json({ message: "No active subscription" });
    }

    const targetCancelAtPeriodEnd = enable !== true;

    const updated = await stripe.subscriptions.update(String(s.stripe_subscription_id), {
      cancel_at_period_end: targetCancelAtPeriodEnd,
      proration_behavior: "none",
    });

    const sub = await stripe.subscriptions.retrieve(String(updated.id), {
      expand: ["items.data.price.product", "latest_invoice"],
    });

    let planRow = null;
    const priceId = sub?.items?.data?.[0]?.price?.id || null;
    if (priceId) {
      planRow = await Plan.findOne({ where: { price_id: priceId, active: true } });
    }

    const view = toSubView(sub, planRow);

    // keep db in sync (dates are still fetched live on GET /subscription)
    await Subscription.update(
      {
        status: view.status,
        plan_price_id: view.plan_price_id,
        plan_interval: view.plan_interval,
        plan_slug: planRow?.plan_slug ?? s.plan_slug ?? null,
      },
      { where: { user_id: req.user.id } },
    );

    return res.json({ data: view });
  } catch (e) {
    next(e);
  }
});

router.get("/plans", async (_req, res, next) => {
  try {
    const plans = await Plan.findAll({
      where: { active: true },
      order: [
        ["sort_order", "ASC"],
        ["unit_amount", "ASC"],
      ],
    });
    res.json({ data: plans });
  } catch (e) {
    next(e);
  }
});

export default router;
