import express from "express";
import { validate } from "../middleware/validate.js";
import {
  registerSchema,
  loginSchema,
  phoneLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validation/schemas.js";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { signJwt } from "../middleware/auth.js";
import { User, sequelize, PasswordReset, OtpCode } from "../models/index.js";
import { fn, col, where, Op } from "sequelize";
import { verifyFirebaseIdToken } from "../utils/fcm.js";
import { sendPasswordResetEmail } from "../utils/email.js";

const router = express.Router();

function isEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// sanitize profile like your OTP router
function sanitizeProfile(p) {
  if (!p || typeof p !== "object") return {};
  const allowed = ["name", "age", "gender", "city"];
  const out = {};
  for (const k of allowed) if (p[k] !== undefined) out[k] = p[k];
  return out;
}

/* ------------------------- REGISTER (email + password) ------------------------- */
router.post("/register", validate({ body: registerSchema }), async (req, res, next) => {
  try {
    const { email, password, code, phone, name, age, gender, city, profilePictureUrl, fcmToken } =
      req.body;

    const emailNorm = String(email).trim().toLowerCase();

    // 1) Email must not exist already
    const existing = await User.findOne({ where: where(fn("lower", col("email")), emailNorm) });
    if (existing) {
      return res.status(409).json({
        message: "Validation failed",
        errors: [{ path: "email", message: "email already exists" }],
      });
    }

    // 2) If phone provided, ensure it's unique too (optional but recommended)
    if (phone) {
      const phoneUsed = await User.findOne({ where: { phone } });
      if (phoneUsed) {
        return res.status(409).json({
          message: "Validation failed",
          errors: [{ path: "phone", message: "phone already exists" }],
        });
      }
    }

    // 3) Verify latest valid OTP for this email
    const otp = await OtpCode.findOne({
      where: {
        target: emailNorm,
        channel: "email",
        purpose: "register",
        used_at: null,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [["created_at", "DESC"]],
    });
    if (!otp) {
      return res.status(400).json({ message: "No valid OTP found or it has expired" });
    }
    if (otp.attempts >= 5) {
      return res.status(400).json({ message: "Too many attempts. Request a new code." });
    }

    console.log("code:", code);
    console.log("otp.code_hash:", otp.code_hash);

    const ok = await bcrypt.compare(String(code), otp.code_hash);
    await otp.update({ attempts: otp.attempts + 1 });
    if (!ok) return res.status(400).json({ message: "Invalid code" });

    // 4) OTP good → mark used, create user mirroring /register
    await otp.update({ used_at: new Date() });
    const password_hash = await bcrypt.hash(String(password), 10);

    const user = await User.create({
      email: emailNorm,
      password_hash,
      phone: phone || null,
      name,
      age,
      gender,
      city: city || null,
      profile_picture_url: profilePictureUrl || null,
      fcm_token: fcmToken || null,
      // mark email verified because OTP confirmed
      email_verified: true,
      phone_verified: false,
    });

    const token = signJwt({ id: user.id, email: user.email });
    user.password_hash = undefined;

    return res.json({ token, user });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------ LOGIN (email) ------------------------------ */
router.post("/login", validate({ body: loginSchema }), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const emailNorm = String(email || "")
      .trim()
      .toLowerCase();

    const user = await User.findOne({
      where: where(fn("lower", col("email")), emailNorm),
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.password_hash) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signJwt({ id: user.id, email: user.email });
    user.password_hash = undefined;

    res.json({ token, user });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------ LOGIN (phone) ------------------------------ */
router.post("/login/phone", validate({ body: phoneLoginSchema }), async (req, res, next) => {
  try {
    const { idToken, fcmToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "Missing idToken" });
    }

    const decoded = await verifyFirebaseIdToken(idToken);
    const phone = decoded.phone_number;

    if (!phone) {
      return res.status(400).json({ message: "Phone number missing in token" });
    }

    let user = await User.findOne({ where: { phone } });

    if (!user) {
      user = await User.create({
        email: null,
        password_hash: null,
        phone,
        name: "New User",
        age: 18,
        gender: "other",
        city: null,
        profile_picture_url: null,
        fcm_token: fcmToken,
      });
    }

    const token = signJwt({ id: user.id, phone: user.phone });
    user.password_hash = undefined;

    res.json({ token, user });
  } catch (e) {
    next(e);
  }
});

router.post(
  "/password/forgot",
  validate({ body: forgotPasswordSchema }),
  async (req, res, next) => {
    try {
      const emailNorm = String(req.body.email || "")
        .trim()
        .toLowerCase();

      const user = await User.findOne({
        where: where(fn("lower", col("email")), emailNorm),
      });

      // Always act successful to avoid user enumeration
      if (!user) {
        return res.json({ ok: true });
      }

      // Rate-limit: max 3 active tokens per user in 1h
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const activeCount = await PasswordReset.count({
        where: { user_id: user.id, created_at: { [Op.gte]: oneHourAgo }, used_at: null },
      });
      if (activeCount >= 3) {
        return res.json({ ok: true });
      }

      const rawToken = randomBytes(32).toString("hex"); // 64 chars
      const token_hash = await bcrypt.hash(rawToken, 10);
      const expires_at = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      await PasswordReset.create({
        user_id: user.id,
        token_hash,
        expires_at,
      });

      const base = process.env.BASE_FRONTEND_URL + "/forgot" || "http://localhost:3000/forgot";
      const resetLink = `${base}?token=${rawToken}`;

      await sendPasswordResetEmail(user.email, resetLink);

      return res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);

/* ------------------------- RESET PASSWORD (using token) ------------------------- */
router.post("/password/reset", validate({ body: resetPasswordSchema }), async (req, res, next) => {
  try {
    const { token, password } = req.body;

    const pr = await PasswordReset.findOne({
      where: {
        used_at: null,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [["created_at", "DESC"]],
    });

    if (!pr) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const ok = await bcrypt.compare(token, pr.token_hash);
    if (!ok) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const user = await User.findOne({ where: { id: pr.user_id } });
    if (!user) {
      return res.status(400).json({ message: "Invalid token" });
    }

    const password_hash = await bcrypt.hash(String(password), 10);
    await user.update({ password_hash });

    await pr.update({ used_at: new Date() });

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/logout", (req, res) => {
  res.cookie("token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    path: "/", // must match the path where the cookie was set
  });

  return res.json({ ok: true, message: "Logged out successfully" });
});

export default router;
