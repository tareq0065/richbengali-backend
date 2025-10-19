import express from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { usersListQuerySchema, userIdParamSchema, updateMeSchema } from "../validation/schemas.js";
import { requireAuth } from "../middleware/auth.js";
import { User, Op, sequelize, UserPhoto, UserProfile } from "../models/index.js";
import { maskEmail, maskPhone, toMeView, toProfileView } from "../utils/sql.js";
import multer from "multer";
import { uploadToS3, deleteFromS3 } from "../utils/s3.js";
import { ensureMember, ensureAll, normalizeMany, normalizeOne } from "../services/refsService.js"; // <-- NEW

const router = express.Router();

/* ----------------------- Unified "me" (define BEFORE /:id) ----------------------- */
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const [user, profile, photos] = await Promise.all([
      User.findByPk(req.user.id),
      UserProfile.findOne({ where: { user_id: req.user.id } }),
      UserPhoto.findAll({
        where: { user_id: req.user.id },
        order: [["sort_order", "ASC"]],
      }),
    ]);
    return res.json({ success: true, data: toMeView(user, profile, photos) });
  } catch (e) {
    next(e);
  }
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const parsed = updateMeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid data", errors: parsed.error.issues });
    }

    const data = parsed.data;

    // ---- DB-driven membership checks (AFTER Zod parse, BEFORE write) ----
    // These align with /refs/:type data; store slugs in profile
    if (data.looking_for != null) {
      data.looking_for = await normalizeOne("looking_for", data.looking_for);
      if (data.looking_for === null) data.looking_for = null;
    }
    if (data.education_level != null) {
      data.education_level = await normalizeOne("education_level", data.education_level);
      if (data.education_level === null) data.education_level = null;
    }
    if (data.religion != null) {
      data.religion = await normalizeOne("religion", data.religion);
      if (data.religion === null) data.religion = null;
    }
    if (Array.isArray(data.languages)) {
      data.languages = await normalizeMany("language", data.languages);
    }
    if (Array.isArray(data.interests)) {
      data.interests = await normalizeMany("interest", data.interests);
    }
    // ------------------------------------------------------------------------------

    // ---- Membership checks stay the same (now they receive clean slugs) ----
    if (data.looking_for && !(await ensureMember("looking_for", data.looking_for))) {
      return res.status(400).json({ success: false, message: "Invalid looking_for" });
    }
    if (data.education_level && !(await ensureMember("education_level", data.education_level))) {
      return res.status(400).json({ success: false, message: "Invalid education_level" });
    }
    if (data.religion && !(await ensureMember("religion", data.religion))) {
      return res.status(400).json({ success: false, message: "Invalid religion" });
    }
    if (data.languages && !(await ensureAll("language", data.languages))) {
      return res.status(400).json({ success: false, message: "Invalid languages" });
    }
    if (data.interests && !(await ensureAll("interest", data.interests))) {
      return res.status(400).json({ success: false, message: "Invalid interests" });
    }
    // --------------------------------------------------------------------

    const t = await User.sequelize.transaction();
    try {
      // split into core vs extended
      const core = (({ name, age, gender, city, profile_picture_url }) => ({
        name,
        age,
        gender,
        city,
        profile_picture_url,
      }))(data);

      const ext = (({
        height_cm,
        weight_kg,
        looking_for,
        work,
        education,
        education_level,
        drinking,
        smoking,
        religion,
        languages,
        interests,
      }) => ({
        height_cm,
        weight_kg,
        looking_for,
        work,
        education,
        education_level,
        drinking,
        smoking,
        religion,
        languages,
        interests,
      }))(data);

      // update core if provided
      const coreKeys = Object.keys(core).filter((k) => core[k] !== undefined);
      if (coreKeys.length) {
        await User.update(core, { where: { id: req.user.id }, transaction: t });
      }

      // upsert extended
      const [prof, created] = await UserProfile.findOrCreate({
        where: { user_id: req.user.id },
        defaults: { user_id: req.user.id, ...ext },
        transaction: t,
      });
      if (!created) await prof.update(ext, { transaction: t });

      const [user, profile, photos] = await Promise.all([
        User.findByPk(req.user.id, { transaction: t }),
        UserProfile.findOne({ where: { user_id: req.user.id }, transaction: t }),
        UserPhoto.findAll({
          where: { user_id: req.user.id },
          order: [["sort_order", "ASC"]],
          transaction: t,
        }),
      ]);

      await t.commit();
      return res.json({ success: true, data: toMeView(user, profile, photos) });
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (e) {
    next(e);
  }
});

/* ----------------------- List users ----------------------- */
router.get("/", requireAuth, validate({ query: usersListQuerySchema }), async (req, res, next) => {
  try {
    const { cityStartsWith, minAge, maxAge } = req.query;

    const where = {
      id: { [Op.ne]: req.user.id },
    };

    if (cityStartsWith) where.city = { [Op.iLike]: `${cityStartsWith}%` };
    if (minAge) where.age = { ...(where.age || {}), [Op.gte]: Number(minAge) };
    if (maxAge) where.age = { ...(where.age || {}), [Op.lte]: Number(maxAge) };

    const excludeFavorites = sequelize.literal(`"User"."id" NOT IN (
      SELECT target_id FROM user_relations
      WHERE actor_id = '${req.user.id}' AND kind = 'favorite'
    )`);

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

    // 1) Pull users (without photos yet)
    const users = await User.findAll({
      attributes: { include: [isBoostedAttr, isLikedAttr, isFavoritedAttr, isSuperlikedAttr] },
      where: { ...where, [Op.and]: [excludeFavorites] },
      order: [
        [sequelize.literal("is_boosted"), "DESC"],
        ["created_at", "DESC"],
      ],
      limit: 100,
    });

    // 2) Pull all photos for these users in one query and group by user_id
    const ids = users.map((u) => u.id);
    let photosByUser = new Map();
    if (ids.length) {
      const allPhotos = await UserPhoto.findAll({
        where: { user_id: { [Op.in]: ids } },
        order: [
          ["user_id", "ASC"],
          ["sort_order", "ASC"],
        ],
        attributes: ["id", "user_id", "url", "sort_order", "is_primary"],
      });
      photosByUser = allPhotos.reduce((acc, p) => {
        if (!acc.has(p.user_id)) acc.set(p.user_id, []);
        acc.get(p.user_id).push({
          id: p.id,
          url: p.url,
          sort_order: p.sort_order,
          is_primary: p.is_primary,
        });
        return acc;
      }, new Map());
    }

    // 3) Sanitize + attach photos
    const data = users.map((u) => {
      const x = u.toJSON();
      delete x.password_hash;
      x.email = maskEmail(x.email);
      x.phone = maskPhone(x.phone);

      const pics = photosByUser.get(u.id) || [];
      x.photos = pics; // full ordered list
      x.primary_photo_url = pics.find((p) => p.is_primary)?.url || x.profile_picture_url || null;

      return x;
    });

    res.json({ data });
  } catch (e) {
    next(e);
  }
});

/* ----------------------- Get user by id (leave after /me) ----------------------- */
router.get("/:id", requireAuth, validate({ params: userIdParamSchema }), async (req, res, next) => {
  try {
    const isBoostedAttr = [
      sequelize.literal(`EXISTS(
        SELECT 1 FROM user_boosts b WHERE b.user_id = "User".id AND b.expires_at > NOW()
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

    // Fetch core user (+ computed flags), profile, and photos in parallel
    const [u, profile, photos] = await Promise.all([
      User.findByPk(req.params.id, {
        attributes: { include: [isBoostedAttr, isLikedAttr, isFavoritedAttr, isSuperlikedAttr] },
      }),
      UserProfile.findOne({ where: { user_id: req.params.id } }),
      UserPhoto.findAll({
        where: { user_id: req.params.id },
        order: [["sort_order", "ASC"]],
      }),
    ]);

    if (!u) return res.status(404).json({ message: "Not found" });

    // Build unified view and mask sensitive contact fields
    const view = toProfileView(u, profile, photos);
    view.email = maskEmail(view.email);
    view.phone = maskPhone(view.phone);
    return res.json({ data: view });
  } catch (e) {
    next(e);
  }
});

/* ----------------------- Photos (max 5, ≤2MB) ----------------------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    /image\/(png|jpe?g|webp)/.test(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Only PNG/JPG/WEBP allowed")),
});

router.post("/me/photos", requireAuth, upload.single("file"), async (req, res, next) => {
  try {
    const count = await UserPhoto.count({ where: { user_id: req.user.id } });
    if (count >= 5) return res.status(400).json({ success: false, message: "Max 5 photos" });

    const { url, key } = await uploadToS3(req.file);
    const photo = await UserPhoto.create({
      user_id: req.user.id,
      url,
      storage_key: key,
      sort_order: count,
      is_primary: count === 0,
    });

    return res.json({
      success: true,
      data: {
        id: photo.id,
        url: photo.url,
        sort_order: photo.sort_order,
        is_primary: photo.is_primary,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.delete("/me/photos/:id", requireAuth, async (req, res, next) => {
  try {
    const photo = await UserPhoto.findOne({ where: { id: req.params.id, user_id: req.user.id } });
    if (!photo) return res.status(404).json({ success: false, message: "Not found" });

    if (photo.storage_key) await deleteFromS3(photo.storage_key);
    await photo.destroy();

    const remaining = await UserPhoto.findAll({
      where: { user_id: req.user.id },
      order: [["sort_order", "ASC"]],
    });
    await Promise.all(remaining.map((p, i) => p.update({ sort_order: i })));
    if (!remaining.some((p) => p.is_primary) && remaining[0])
      await remaining[0].update({ is_primary: true });

    return res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.patch("/me/photos/:id/primary", requireAuth, async (req, res, next) => {
  try {
    const photo = await UserPhoto.findOne({ where: { id: req.params.id, user_id: req.user.id } });
    if (!photo) return res.status(404).json({ success: false, message: "Not found" });
    await UserPhoto.update({ is_primary: false }, { where: { user_id: req.user.id } });
    await photo.update({ is_primary: true });
    return res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.patch("/me/photos/reorder", requireAuth, async (req, res, next) => {
  try {
    const { order } = req.body || {};
    if (!Array.isArray(order))
      return res.status(400).json({ success: false, message: "order array required" });

    const photos = await UserPhoto.findAll({ where: { user_id: req.user.id } });
    const byId = new Map(photos.map((p) => [p.id, p]));
    await Promise.all(order.map((id, idx) => byId.get(id)?.update({ sort_order: idx })));
    return res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
