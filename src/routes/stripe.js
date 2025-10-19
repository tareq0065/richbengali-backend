import express from "express";
import { validate } from "../middleware/validate.js";
import { stripeCheckoutSchema } from "../validation/schemas.js";
import { requireAuth } from "../middleware/auth.js";
import { stripe, PRICE_IDS, PACK_QUANTITIES } from "../utils/stripe.js";
import { Plan, Subscription, User, UserCredit, UserCreditEvent } from "../models/index.js";

const router = express.Router();

/* ---------------------------------
   Helpers: safe integer handling
---------------------------------- */
const toIntSafe = (v) => {
  const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

const addSafe = (...nums) => nums.reduce((s, v) => s + toIntSafe(v), 0);

/* ============================
   POST /stripe/checkout
   ============================ */
router.post(
  "/checkout",
  requireAuth,
  validate({ body: stripeCheckoutSchema }),
  async (req, res, next) => {
    try {
      const { plan, price_id } = req.body;
      let price = price_id;

      // Resolve price id (DB plan_slug → price_id, or env fallback)
      if (!price) {
        if (plan) {
          const p = await Plan.findOne({ where: { plan_slug: plan, active: true } });
          if (p) price = p.price_id;
        }
        if (!price) price = PRICE_IDS?.[plan];
      }

      if (!price || typeof price !== "string" || !price.startsWith("price_")) {
        return res.status(400).json({ message: "Invalid or missing Stripe price_id" });
      }

      // Derive mode
      let mode = "";
      if (price_id) {
        const pr = await stripe.prices.retrieve(price);
        mode = pr?.recurring ? "subscription" : "payment";
      } else {
        mode = ["weekly", "monthly", "yearly"].includes(plan) ? "subscription" : "payment";
      }

      const FE = process.env.BASE_FRONTEND_URL || "http://localhost:3000";
      const success_url = `${FE}/subscription?status=success&plan=${encodeURIComponent(
        plan || "",
      )}&price_id=${encodeURIComponent(price)}&session_id={CHECKOUT_SESSION_ID}`;
      const cancel_url = `${FE}/subscription?status=cancel&plan=${encodeURIComponent(
        plan || "",
      )}&price_id=${encodeURIComponent(price)}`;

      const session = await stripe.checkout.sessions.create({
        mode,
        line_items: [{ price, quantity: 1 }],
        success_url,
        cancel_url,
        metadata: {
          userId: req.user.id, // used to assert ownership in /confirm
          plan: plan || null, // legacy fallback
          price_id: price, // primary link back to Plan/Price
        },
      });

      res.json({ url: session.url });
    } catch (e) {
      next(e);
    }
  },
);

/* ============================
   POST /stripe/confirm
   (Hardened: no NaN, robust fallbacks)
   ============================ */
router.post("/confirm", requireAuth, async (req, res, next) => {
  try {
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ message: "session_id required" });

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription"],
    });

    // Normalize potential string/number mismatch
    const sessionUserId = session?.metadata?.userId ? String(session.metadata.userId) : null;
    const reqUserId = String(req.user.id);
    if (sessionUserId && sessionUserId !== reqUserId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const isOneTime = session.mode !== "subscription";
    const isComplete = session.status === "complete";
    const oneTimePaid = session.payment_status === "paid";

    // Resolve sub if needed (supports trials / no initial payment)
    let sub = null;
    if (!isOneTime) {
      if (session.subscription && typeof session.subscription === "object") {
        sub = session.subscription;
      } else if (typeof session.subscription === "string") {
        sub = await stripe.subscriptions.retrieve(session.subscription, {
          expand: ["items.data.price", "latest_invoice"],
        });
      }
    }

    const subReady = !isOneTime && !!sub;
    if ((isOneTime && !(isComplete && oneTimePaid)) || (!isOneTime && !(isComplete && subReady))) {
      return res.status(409).json({ message: "Session not completed yet" });
    }

    const userId = String(sessionUserId ?? req.user.id);

    if (!isOneTime) {
      // ===== SUBSCRIPTION PATH =====
      const item = sub?.items?.data?.[0] || null;
      const priceId = item?.price?.id || session?.metadata?.price_id || null;
      const interval = item?.price?.recurring?.interval || null;

      let planSlug = null;
      if (priceId) {
        const planRow = await Plan.findOne({ where: { price_id: priceId, active: true } });
        planSlug = planRow?.plan_slug || null;
      }

      await Subscription.upsert({
        user_id: userId,
        stripe_customer_id: session.customer,
        stripe_subscription_id: sub?.id || null,
        status: sub?.status || "active",
        plan_price_id: priceId,
        plan_interval: interval,
        plan_slug: planSlug,
      });

      await User.update({ is_premium: true }, { where: { id: userId } });
      return res.json({ ok: true, kind: "subscription" });
    }

    // ===== ONE-TIME PACKS =====
    // 1) Identify priceId (prefer metadata, fallback to first line item)
    const lineItems = await stripe.checkout.sessions.listLineItems(session_id, {
      limit: 10,
      expand: ["data.price"],
    });
    const first = lineItems?.data?.[0];
    const priceId = session?.metadata?.price_id || first?.price?.id || null;

    // 2) Resolve increments safely (DB Plan → Price metadata → fetched Price → legacy PACK_QUANTITIES)
    let inc = { superlike_credits: 0, boost_credits: 0, premium_tokens: 0 };
    let eventType = "purchase";

    const applyCredit = (type, qty) => {
      const n = toIntSafe(qty);
      if (type === "superlike") {
        eventType = "superlike";
        inc.superlike_credits = n;
      } else if (type === "boost") {
        eventType = "boost";
        inc.boost_credits = n;
      } else if (type === "premium") {
        eventType = "premium";
        inc.premium_tokens = n;
      }
    };

    if (priceId) {
      // Prefer DB Plan mapping
      const planRow = await Plan.findOne({ where: { price_id: priceId, active: true } });
      if (planRow?.credit_type) {
        applyCredit(planRow.credit_type, toIntSafe(planRow.credit_quantity));
      } else if (first?.price?.metadata) {
        applyCredit(
          first.price.metadata.credit_type,
          toIntSafe(first.price.metadata.credit_quantity),
        );
      } else {
        // Fetch price for metadata as a last resort
        const pr = await stripe.prices.retrieve(priceId);
        const md = pr?.metadata || {};
        applyCredit(md.credit_type, toIntSafe(md.credit_quantity));
      }
    }

    // Legacy fallback (PACK_QUANTITIES) if nothing was resolved
    if (
      toIntSafe(inc.superlike_credits) === 0 &&
      toIntSafe(inc.boost_credits) === 0 &&
      toIntSafe(inc.premium_tokens) === 0
    ) {
      const legacyPlan = session?.metadata?.plan;
      if (legacyPlan === "superlike") {
        eventType = "superlike";
        inc.superlike_credits = toIntSafe(PACK_QUANTITIES?.superlike);
      } else if (legacyPlan === "boost") {
        eventType = "boost";
        inc.boost_credits = toIntSafe(PACK_QUANTITIES?.boost);
      } else if (legacyPlan === "premium") {
        eventType = "premium";
        inc.premium_tokens = toIntSafe(PACK_QUANTITIES?.premium);
      }
    }

    // Optional guardrail: if still zero, surface a helpful error
    if (
      toIntSafe(inc.superlike_credits) === 0 &&
      toIntSafe(inc.boost_credits) === 0 &&
      toIntSafe(inc.premium_tokens) === 0
    ) {
      return res.status(422).json({
        message:
          "No credits resolved for this purchase. Check Plan.price_id or Stripe Price metadata (credit_type, credit_quantity).",
      });
    }

    // 3) Upsert credits safely (no NaN math)
    let credit = await UserCredit.findOne({ where: { user_id: userId } });
    if (!credit) {
      credit = await UserCredit.create({
        user_id: userId,
        superlike_credits: 0,
        boost_credits: 0,
        premium_tokens: 0,
      });
    }

    const currSuper = toIntSafe(credit.superlike_credits);
    const currBoost = toIntSafe(credit.boost_credits);
    const currPremium = toIntSafe(credit.premium_tokens);

    const nextSuper = currSuper + toIntSafe(inc.superlike_credits);
    const nextBoost = currBoost + toIntSafe(inc.boost_credits);
    const nextPremium = currPremium + toIntSafe(inc.premium_tokens);

    await UserCredit.update(
      {
        superlike_credits: nextSuper,
        boost_credits: nextBoost,
        premium_tokens: nextPremium,
        updated_at: new Date(),
      },
      { where: { user_id: userId } },
    );

    await UserCreditEvent.create({
      user_id: userId,
      type: eventType,
      delta: addSafe(inc.superlike_credits, inc.boost_credits, inc.premium_tokens),
      reason: "purchase",
    });

    return res.json({ ok: true, kind: "one-time", inc });
  } catch (e) {
    next(e);
  }
});

/* ============================
   POST /stripe/webhook
   (unchanged except for safe ints)
   ============================ */
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed.", err.message);
    return res.sendStatus(400);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = String(session?.metadata?.userId || "");
      let plan = session?.metadata?.plan || null;
      const priceIdMeta = session?.metadata?.price_id || null;

      if (session.mode === "subscription") {
        const subId = session.subscription;
        const sub = await stripe.subscriptions.retrieve(subId, {
          expand: ["items.data.price", "latest_invoice"],
        });

        const priceId = sub?.items?.data?.[0]?.price?.id || priceIdMeta || null;
        const interval = sub?.items?.data?.[0]?.price?.recurring?.interval || null;

        let plan_slug = null;
        if (priceId) {
          const planRow = await Plan.findOne({ where: { price_id: priceId, active: true } });
          plan_slug = planRow?.plan_slug || null;
        }

        await Subscription.upsert({
          user_id: userId,
          stripe_customer_id: session.customer,
          stripe_subscription_id: sub.id,
          status: sub.status,
          current_period_end: new Date(sub.current_period_end * 1000),
          plan_price_id: priceId,
          plan_interval: interval,
          plan_slug,
        });

        await User.update({ is_premium: true }, { where: { id: userId } });
      } else {
        // one-time packs -> increment credits
        let inc = { superlike_credits: 0, boost_credits: 0, premium_tokens: 0 };
        let eventType = null;

        const applyCredit = (type, qty) => {
          const n = toIntSafe(qty);
          if (type === "superlike") {
            eventType = "superlike";
            inc.superlike_credits = n;
          } else if (type === "boost") {
            eventType = "boost";
            inc.boost_credits = n;
          } else if (type === "premium") {
            eventType = "premium";
            inc.premium_tokens = n;
          }
        };

        if (priceIdMeta) {
          const p = await Plan.findOne({ where: { price_id: priceIdMeta, active: true } });
          if (p?.credit_type) {
            applyCredit(p.credit_type, toIntSafe(p.credit_quantity));
          } else {
            try {
              const pr = await stripe.prices.retrieve(priceIdMeta);
              const md = pr?.metadata || {};
              applyCredit(md.credit_type, toIntSafe(md.credit_quantity));
            } catch (e) {
              // ignore; may fallback to legacy below
            }
          }
        }

        if (!eventType && plan) {
          if (plan === "superlike") {
            eventType = "superlike";
            inc.superlike_credits = toIntSafe(PACK_QUANTITIES?.superlike);
          }
          if (plan === "boost") {
            eventType = "boost";
            inc.boost_credits = toIntSafe(PACK_QUANTITIES?.boost);
          }
          if (plan === "premium") {
            eventType = "premium";
            inc.premium_tokens = toIntSafe(PACK_QUANTITIES?.premium);
          }
        }

        let c = await UserCredit.findOne({ where: { user_id: userId } });
        if (!c) {
          c = await UserCredit.create({
            user_id: userId,
            superlike_credits: 0,
            boost_credits: 0,
            premium_tokens: 0,
          });
        }

        const currSuper = toIntSafe(c.superlike_credits);
        const currBoost = toIntSafe(c.boost_credits);
        const currPremium = toIntSafe(c.premium_tokens);

        await UserCredit.update(
          {
            superlike_credits: currSuper + toIntSafe(inc.superlike_credits),
            boost_credits: currBoost + toIntSafe(inc.boost_credits),
            premium_tokens: currPremium + toIntSafe(inc.premium_tokens),
            updated_at: new Date(),
          },
          { where: { user_id: userId } },
        );

        await UserCreditEvent.create({
          user_id: userId,
          type: eventType || "purchase",
          delta: addSafe(inc.superlike_credits, inc.boost_credits, inc.premium_tokens),
          reason: "purchase",
        });
      }
    }
  } catch (e) {
    console.error(e);
  }

  res.json({ received: true });
});

export default router;
