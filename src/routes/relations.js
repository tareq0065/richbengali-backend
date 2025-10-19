import express from "express";
import { validate } from "../middleware/validate.js";
import {
  relationParamSchema,
  superlikeParamSchema,
  userIdParamSchema,
} from "../validation/schemas.js";
import { requireAuth } from "../middleware/auth.js";
import { UserRelation, Notification, User } from "../models/index.js";
import { sendPush } from "../utils/fcm.js";
import { sequelize } from "../config/sequelize.js";
import { consumeCredit } from "./sharedCredits.js";
import { Op } from "sequelize";
import { maskEmail, maskPhone } from "../utils/sql.js";

const router = express.Router();

async function ensureRelation(actor_id, target_id, kind) {
  const [rel] = await UserRelation.findOrCreate({
    where: { actor_id, target_id, kind },
    defaults: { actor_id, target_id, kind },
  });
  return rel;
}

router.get("/visitors", requireAuth, async (req, res, next) => {
  try {
    const isBoostedAttr = [
      sequelize.literal(`EXISTS(
        SELECT 1 FROM user_boosts b WHERE b.user_id = "User".id AND b.expires_at > NOW()
      )`),
      "is_boosted",
    ];

    // last time this user visited me
    const lastVisitExpr = sequelize.literal(`(
      SELECT MAX(ur.created_at)
      FROM user_relations ur
      WHERE ur.kind = 'visit'
        AND ur.target_id = '${req.user.id}'
        AND ur.actor_id = "User".id
    )`);

    const users = await User.findAll({
      attributes: {
        include: [[lastVisitExpr, "last_visit_at"], isBoostedAttr],
      },
      where: {
        id: {
          [Op.in]: sequelize.literal(`(
            SELECT actor_id
            FROM user_relations
            WHERE kind = 'visit' AND target_id = '${req.user.id}'
          )`),
        },
        [Op.and]: [{ id: { [Op.ne]: req.user.id } }],
      },
      order: [
        [sequelize.literal("last_visit_at"), "DESC"],
        ["created_at", "DESC"],
      ],
      limit: 500,
    });

    const data = users.map((u) => {
      const x = u.toJSON();
      delete x.password_hash;
      x.email = maskEmail(x.email);
      x.phone = maskPhone(x.phone);
      return x;
    });

    res.json({ data });
  } catch (e) {
    next(e);
  }
});

// GET /relations/visits - users I visited
router.get("/visits", requireAuth, async (req, res, next) => {
  try {
    const isBoostedAttr = [
      sequelize.literal(`EXISTS(
        SELECT 1 FROM user_boosts b WHERE b.user_id = "User".id AND b.expires_at > NOW()
      )`),
      "is_boosted",
    ];

    // last time I visited this user
    const lastVisitExpr = sequelize.literal(`(
      SELECT MAX(ur.created_at)
      FROM user_relations ur
      WHERE ur.kind = 'visit'
        AND ur.actor_id = '${req.user.id}'
        AND ur.target_id = "User".id
    )`);

    const users = await User.findAll({
      attributes: {
        include: [[lastVisitExpr, "last_visit_at"], isBoostedAttr],
      },
      where: {
        id: {
          [Op.in]: sequelize.literal(`(
            SELECT target_id
            FROM user_relations
            WHERE kind = 'visit' AND actor_id = '${req.user.id}'
          )`),
        },
        [Op.and]: [{ id: { [Op.ne]: req.user.id } }],
      },
      order: [
        [sequelize.literal("last_visit_at"), "DESC"],
        ["created_at", "DESC"],
      ],
      limit: 500,
    });

    const data = users.map((u) => {
      const x = u.toJSON();
      delete x.password_hash;
      x.email = maskEmail(x.email);
      x.phone = maskPhone(x.phone);
      return x;
    });

    res.json({ data });
  } catch (e) {
    next(e);
  }
});

router.get("/favorites", requireAuth, async (req, res, next) => {
  try {
    // Optional: boosted flag like your /users list
    const isBoostedAttr = [
      sequelize.literal(`EXISTS(
          SELECT 1 FROM user_boosts b
          WHERE b.user_id = "User".id AND b.expires_at > NOW()
        )`),
      "is_boosted",
    ];

    const isLikedAttr = [
      sequelize.literal(`EXISTS(
        SELECT 1 FROM user_relations ur
        WHERE ur.actor_id = '${req.user.id}'
          AND ur.target_id = "User".id
          AND ur.kind = 'like'
      )`),
      "is_liked",
    ];

    const isFavoritedAttr = [
      sequelize.literal(`EXISTS(
        SELECT 1 FROM user_relations ur
        WHERE ur.actor_id = '${req.user.id}'
          AND ur.target_id = "User".id
          AND ur.kind = 'favorite'
      )`),
      "is_favorited",
    ];

    const isSuperlikedAttr = [
      sequelize.literal(`EXISTS(
        SELECT 1 FROM user_relations ur
        WHERE ur.actor_id = '${req.user.id}'
          AND ur.target_id = "User".id
          AND ur.kind = 'superlike'
      )`),
      "is_superliked",
    ];

    const users = await User.findAll({
      attributes: {
        include: [isBoostedAttr, isLikedAttr, isFavoritedAttr, isSuperlikedAttr],
        // exclude sensitive fields if you like:
        // exclude: ["password_hash"]
      },
      where: {
        id: {
          [Op.in]: sequelize.literal(`(
              SELECT target_id
              FROM user_relations
              WHERE actor_id = '${req.user.id}' AND kind = 'favorite'
            )`),
        },
        // also make sure we never return the requester accidentally
        [Op.and]: [{ id: { [Op.ne]: req.user.id } }],
      },
      order: [
        [sequelize.literal("is_boosted"), "DESC"],
        ["created_at", "DESC"],
      ],
      limit: 500,
    });

    const sanitized = users.map((u) => {
      const x = u.toJSON();
      delete x.password_hash;
      x.email = maskEmail(x.email);
      x.phone = maskPhone(x.phone);
      return x;
    });

    res.json({ data: sanitized });
  } catch (e) {
    next(e);
  }
});

router.post(
  "/:targetId/:kind(like|favorite)",
  requireAuth,
  validate({ params: relationParamSchema }),
  async (req, res, next) => {
    try {
      const { targetId, kind } = req.params;
      const relation = await ensureRelation(req.user.id, targetId, kind);
      const notif = await Notification.create({
        user_id: targetId,
        type: kind,
        actor_id: req.user.id,
        payload: {},
      });
      const target = await User.findByPk(targetId);
      if (target?.fcm_token) {
        await sendPush({
          token: target.fcm_token,
          title: `New ${kind}!`,
          body: "Someone interacted with you.",
        });
      }
      req.app.get("io").to(targetId).emit("notification:new", notif.toJSON());
      res.json({ data: relation });
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/:targetId/:kind(like|favorite)",
  requireAuth,
  validate({ params: relationParamSchema }),
  async (req, res, next) => {
    try {
      const { targetId, kind } = req.params;

      // guard: no self-relations
      if (targetId === req.user.id) return res.status(400).json({ message: "Invalid target" });

      const removed = await UserRelation.destroy({
        where: { actor_id: req.user.id, target_id: targetId, kind },
      });

      // no notification for removals; they’re usually silent
      return res.json({ ok: true, removed: removed > 0 });
    } catch (e) {
      next(e);
    }
  },
);

// Superlike consumes one credit then ensures a 'like' relation and special notification
router.post(
  "/:targetId/superlike",
  requireAuth,
  validate({ params: superlikeParamSchema }),
  async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
      const { targetId } = req.params;

      // 🔥 First, check credit balance
      const credit = await consumeCredit(req.user.id, "superlike", { transaction: t });

      const [relation] = await UserRelation.findOrCreate({
        where: { actor_id: req.user.id, target_id: targetId, kind: "like" },
        defaults: { actor_id: req.user.id, target_id: targetId, kind: "like" },
        transaction: t,
      });

      const [superRel] = await UserRelation.findOrCreate({
        where: { actor_id: req.user.id, target_id: targetId, kind: "superlike" },
        defaults: { actor_id: req.user.id, target_id: targetId, kind: "superlike" },
        transaction: t,
      });

      const notif = await Notification.create(
        { user_id: targetId, type: "superlike", actor_id: req.user.id, payload: { super: true } },
        { transaction: t },
      );

      await t.commit();

      const target = await User.findByPk(targetId);
      if (target?.fcm_token) {
        await sendPush({
          token: target.fcm_token,
          title: "You received a Super Like!",
          body: "Someone super liked your profile.",
        });
      }

      req.app.get("io").to(targetId).emit("notification:new", notif.toJSON());
      res.json({ data: { relation, superlike: true, remaining: credit.amount } });
    } catch (e) {
      await t.rollback();
      if (e.code === "NO_CREDIT")
        return res.status(400).json({ message: "Not enough Super Like credits" });
      next(e);
    }
  },
);

/**
 * GET /relations/status/:targetId
 * Returns booleans for all relation kinds between the current user (actor) and the target.
 * This avoids refetching the whole user profile after a toggle.
 */
router.get(
  "/status/:id",
  requireAuth,
  validate({ params: userIdParamSchema }),
  async (req, res, next) => {
    try {
      const { id: targetId } = req.params;

      // guard: no self
      if (targetId === req.user.id) {
        return res.json({
          data: {
            target_id: targetId,
            is_liked: false,
            is_favorited: false,
            is_superliked: false,
            liked_me: false,
            favorited_me: false,
            superliked_me: false,
            visited: false,
            visited_me: false,
            last_visit_at: null,
            last_visited_me_at: null,
          },
        });
      }

      // single round trip: pull all rows of interest for both directions
      const rels = await UserRelation.findAll({
        where: {
          [Op.or]: [
            { actor_id: req.user.id, target_id: targetId }, // me -> target
            { actor_id: targetId, target_id: req.user.id }, // target -> me
          ],
          kind: { [Op.in]: ["like", "favorite", "superlike", "visit"] },
        },
        attributes: ["actor_id", "target_id", "kind", "created_at"],
        order: [["created_at", "DESC"]],
      });

      // compute flags
      let is_liked = false,
        is_favorited = false,
        is_superliked = false,
        liked_me = false,
        favorited_me = false,
        superliked_me = false,
        visited = false,
        visited_me = false,
        last_visit_at = null,
        last_visited_me_at = null;

      for (const r of rels) {
        const isMeToTarget = r.actor_id === req.user.id && r.target_id === targetId;
        const isTargetToMe = r.actor_id === targetId && r.target_id === req.user.id;

        if (isMeToTarget) {
          if (r.kind === "like") is_liked = true;
          if (r.kind === "favorite") is_favorited = true;
          if (r.kind === "superlike") is_superliked = true;
          if (r.kind === "visit") {
            visited = true;
            if (!last_visit_at || r.created_at > last_visit_at) last_visit_at = r.created_at;
          }
        } else if (isTargetToMe) {
          if (r.kind === "like") liked_me = true;
          if (r.kind === "favorite") favorited_me = true;
          if (r.kind === "superlike") superliked_me = true;
          if (r.kind === "visit") {
            visited_me = true;
            if (!last_visited_me_at || r.created_at > last_visited_me_at)
              last_visited_me_at = r.created_at;
          }
        }
      }

      return res.json({
        data: {
          target_id: targetId,
          is_liked,
          is_favorited,
          is_superliked,
          liked_me,
          favorited_me,
          superliked_me,
          visited,
          visited_me,
          last_visit_at,
          last_visited_me_at,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

/**
 * OPTIONAL: batch status for lists/cards
 * GET /relations/status?ids=uuid,uuid,uuid
 */
router.get("/status", requireAuth, async (req, res, next) => {
  try {
    const idsParam = String(req.query.ids || "").trim();
    if (!idsParam) return res.json({ data: [] });

    const ids = [...new Set(idsParam.split(",").map((s) => s.trim()))].filter(Boolean);
    if (!ids.length) return res.json({ data: [] });

    const rels = await UserRelation.findAll({
      where: {
        [Op.or]: [
          { actor_id: req.user.id, target_id: { [Op.in]: ids } },
          { actor_id: { [Op.in]: ids }, target_id: req.user.id },
        ],
        kind: { [Op.in]: ["like", "favorite", "superlike"] },
      },
      attributes: ["actor_id", "target_id", "kind"],
    });

    // group per target id
    const map = new Map(
      ids.map((id) => [
        id,
        {
          target_id: id,
          is_liked: false,
          is_favorited: false,
          is_superliked: false,
          liked_me: false,
          favorited_me: false,
          superliked_me: false,
        },
      ]),
    );

    for (const r of rels) {
      const isMeToTarget = r.actor_id === req.user.id;
      const t = isMeToTarget ? r.target_id : r.actor_id;
      const bucket = map.get(t);
      if (!bucket) continue;

      if (isMeToTarget) {
        if (r.kind === "like") bucket.is_liked = true;
        if (r.kind === "favorite") bucket.is_favorited = true;
        if (r.kind === "superlike") bucket.is_superliked = true;
      } else {
        if (r.kind === "like") bucket.liked_me = true;
        if (r.kind === "favorite") bucket.favorited_me = true;
        if (r.kind === "superlike") bucket.superliked_me = true;
      }
    }

    return res.json({ data: Array.from(map.values()) });
  } catch (e) {
    next(e);
  }
});

export default router;
