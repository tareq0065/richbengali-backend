import express from "express";
import { validate } from "../middleware/validate.js";
import { creditsUseSchema } from "../validation/schemas.js";
import { requireAuth } from "../middleware/auth.js";
import { User, UserCredit, UserCreditEvent } from "../models/index.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    let c = await UserCredit.findByPk(req.user.id);
    if (!c) c = await UserCredit.create({ user_id: req.user.id });
    res.json({ data: c });
  } catch (e) {
    next(e);
  }
});

router.get("/history", requireAuth, async (req, res, next) => {
  try {
    const events = await UserCreditEvent.findAll({
      where: { user_id: req.user.id },
      order: [["created_at", "DESC"]],
      limit: 200,
    });
    res.json({ data: events });
  } catch (e) {
    next(e);
  }
});

// Consume credits (currently implements premium token activation for 30 days)
router.post("/use", requireAuth, validate({ body: creditsUseSchema }), async (req, res, next) => {
  try {
    const { type } = req.body;
    let c = await UserCredit.findByPk(req.user.id);
    if (!c) c = await UserCredit.create({ user_id: req.user.id });

    if (type === "premium") {
      if ((c.premium_tokens || 0) <= 0) {
        return res.status(400).json({ message: "No premium tokens available" });
      }
      const now = new Date();
      const until = new Date(now.getTime());
      // 30 days premium from now (extend if already active)
      const base = req.user.premium_until && new Date(req.user.premium_until) > now
        ? new Date(req.user.premium_until)
        : now;
      until.setDate(base.getDate() + 30);

      await User.update({ is_premium: true, premium_until: until }, { where: { id: req.user.id } });
      await UserCredit.update({ premium_tokens: c.premium_tokens - 1, updated_at: new Date() }, { where: { user_id: req.user.id } });
      await UserCreditEvent.create({ user_id: req.user.id, type: "premium", delta: -1, reason: "token_used" });

      const updated = await UserCredit.findByPk(req.user.id);
      return res.json({ data: { credits: updated, premium_until: until.toISOString() } });
    }

    // For superlike/boost, consumption is handled by respective feature endpoints.
    return res.status(400).json({ message: "Unsupported type for /credits/use" });
  } catch (e) {
    next(e);
  }
});

export default router;
