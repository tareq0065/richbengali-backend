import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Notification, User } from "../models/index.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const list = await Notification.findAll({
      where: { user_id: req.user.id },
      order: [["created_at", "DESC"]],
      limit: 200,
      include: [
        {
          model: User,
          as: "actor",
          attributes: ["id", "name", "profile_picture_url"],
        },
      ],
    });
    res.json({ data: list });
  } catch (e) {
    next(e);
  }
});

router.patch("/:id/read", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [updated] = await Notification.update(
      { is_read: true, read_at: new Date() },
      { where: { id, user_id: req.user.id, is_read: false } },
    );
    res.json({ ok: true, updated });
  } catch (e) {
    next(e);
  }
});

router.post("/read-all", requireAuth, async (req, res, next) => {
  try {
    const [updated] = await Notification.update(
      { is_read: true, read_at: new Date() },
      { where: { user_id: req.user.id, is_read: false } },
    );
    res.json({ ok: true, updated });
  } catch (e) {
    next(e);
  }
});

export default router;
