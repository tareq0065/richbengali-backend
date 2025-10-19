import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { UserRelation, User } from "../models/index.js";
import { sendPush } from "../utils/fcm.js";

const router = express.Router();

/**
 * Record a profile visit as a relation (kind='visit').
 * - Upserts via findOrCreate then touches updatedAt
 * - Optional: push notification (commented to avoid noise)
 * Body: { targetId: string }
 */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { targetId } = req.body || {};
    if (!targetId) return res.status(400).json({ message: "targetId is required" });
    if (targetId === req.user.id) return res.status(400).json({ message: "Cannot visit yourself" });

    const [rel, created] = await UserRelation.findOrCreate({
      where: { actor_id: req.user.id, target_id: targetId, kind: "visit" },
      defaults: { actor_id: req.user.id, target_id: targetId, kind: "visit" },
    });

    // Touch the timestamp so “latest visit” shows correctly
    if (!created) {
      rel.changed("updatedAt", true);
      await rel.save({ hooks: false, silent: false });
    }

    // OPTIONAL: push (can be noisy—enable if you want)
    // const target = await User.findByPk(targetId);
    // if (target?.fcm_token) {
    //   await sendPush({
    //     token: target.fcm_token,
    //     title: "Someone visited your profile",
    //     body: "Open the app to see who it was.",
    //   });
    // }

    // Socket room = target user id
    req.app.get("io").to(targetId).emit("visit:new", {
      actor_id: req.user.id,
      target_id: targetId,
      kind: "visit",
      updated_at: new Date().toISOString(),
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
