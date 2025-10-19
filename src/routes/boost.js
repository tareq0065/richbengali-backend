import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { sequelize } from "../config/sequelize.js";
import { UserBoost } from "../models/index.js";
import { consumeCredit } from "./sharedCredits.js";

const router = express.Router();

router.post("/activate", requireAuth, async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    await consumeCredit(req.user.id, "boost", { transaction: t });
    const boost = await UserBoost.create(
      {
        user_id: req.user.id,
        activated_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
      },
      { transaction: t },
    );
    await t.commit();
    res.json({ data: boost });
  } catch (e) {
    await t.rollback();
    next(e);
  }
});

router.get("/active", requireAuth, async (req, res, next) => {
  try {
    const list = await UserBoost.findAll({
      where: { user_id: req.user.id, expires_at: { $gt: new Date() } },
    });
    res.json({ data: list });
  } catch (e) {
    next(e);
  }
});

export default router;
