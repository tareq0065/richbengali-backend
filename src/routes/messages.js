import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireChatAccess } from "../middleware/chatAccess.js";
import { Message, User, Notification, sequelize } from "../models/index.js";

const router = express.Router();

// Get history with specific user (gated)
router.get("/:otherUserId", requireAuth, requireChatAccess, async (req, res, next) => {
  try {
    const a = req.user.id,
      b = req.params.otherUserId;
    const room = [a, b].sort().join(":");
    const msgs = await Message.findAll({
      where: { room_id: room },
      order: [["created_at", "ASC"]],
      limit: 200,
    });
    res.json({ data: msgs });
  } catch (e) {
    next(e);
  }
});

// Distinct conversations (only users you've exchanged at least one message with)
router.get("/", requireAuth, requireChatAccess, async (req, res, next) => {
  try {
    const me = req.user.id;
    const rows = await sequelize.query(
      `
      SELECT
        (CASE WHEN sender_id = :me THEN receiver_id ELSE sender_id END) AS other_id,
        MAX(created_at) AS last_at
      FROM messages
      WHERE sender_id = :me OR receiver_id = :me
      GROUP BY other_id
      ORDER BY last_at DESC
      LIMIT 100
      `,
      { replacements: { me }, type: sequelize.QueryTypes.SELECT },
    );

    const ids = rows.map((r) => r.other_id);
    const list = ids.length ? await User.findAll({ where: { id: ids } }) : [];
    // Optional: attach last_at
    const lastMap = Object.fromEntries(rows.map((r) => [r.other_id, r.last_at]));
    const data = list.map((u) => ({ ...u.toJSON(), last_at: lastMap[u.id] }));
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

// HTTP send (keeps socket path intact; useful as fallback)
router.post("/", requireAuth, requireChatAccess, async (req, res, next) => {
  try {
    const from = String(req.user.id);
    const { to, content } = req.body;
    const toId = String(to);
    const room = [from, toId].sort().join(":");

    const msg = await Message.create({
      room_id: room,
      content,
      sender_id: from,
      receiver_id: toId,
    });

    const io = req.app.get("io");
    const activeByUser = req.app.get("activeByUser");
    const toActives = activeByUser && activeByUser.get(toId);
    const isActive = !!toActives && toActives.has(from);

    if (!isActive) {
      await Notification.create({
        user_id: toId,
        type: "message",
        actor_id: from,
        payload: { room_id: room },
      });
    }

    if (io) {
      io.to(room).emit("chat:message", msg.toJSON());
      if (!isActive) {
        io.to(toId).emit("notification:new", {
          type: "message",
          actor_id: from,
          payload: { room_id: room },
          created_at: new Date().toISOString(),
        });
      }
    }

    res.json({ data: msg });
  } catch (e) {
    next(e);
  }
});

export default router;
