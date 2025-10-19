import express from "express";
import { Op } from "sequelize";
import jwt from "jsonwebtoken";
import { OtpCode, User } from "../models/index.js";
import { isE164Phone } from "../utils/phone.js";
import { generateOtpCode, hashOtp, verifyOtp } from "../utils/otp.js";
import { sendEmailOtp } from "../utils/email.js";
import { sendSmsOtp } from "../utils/sms.js";
import { ApiError } from "../utils/errors.js";

const router = express.Router();

const DEV_BYPASS = process.env.OTP_DEV_BYPASS === "true";
const DEV_EXPOSE = process.env.OTP_DEV_BYPASS_EXPOSE === "true";

function isEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizeTarget(target, channel) {
  if (channel === "phone") {
    const t = (target || "").trim();
    if (!isE164Phone(t))
      throw new ApiError("Invalid phone format. Use E.164 like +15551234567.", 400);
    return t;
  }
  if (channel === "email") {
    const t = (target || "").trim().toLowerCase();
    if (!isEmail(t)) throw new ApiError("Invalid email.", 400);
    return t;
  }
  throw new ApiError("Invalid channel", 400);
}

function sanitizeProfile(p) {
  if (!p || typeof p !== "object") return {};
  const allowed = ["name", "age", "gender", "city"];
  const out = {};
  for (const k of allowed) if (p[k] !== undefined) out[k] = p[k];
  return out;
}

// POST /auth/otp/request
router.post("/otp/request", async (req, res) => {
  try {
    const { target, channel, purpose, profile } = req.body || {};
    if (!target || !channel || !purpose) {
      return res.status(400).json({ message: "target, channel, purpose are required" });
    }

    const norm = normalizeTarget(target, channel);

    // --- NEW: account existence checks based on purpose ---
    if (purpose === "register") {
      // For registration: must NOT exist
      const where = channel === "email" ? { email: norm } : { phone: norm };
      const exists = await User.findOne({ where });
      if (exists) {
        return res.status(409).json({
          message: "Validation failed",
          errors: [
            {
              path: channel === "email" ? "email" : "phone",
              message: `${channel === "email" ? "email" : "phone"} already exists`,
            },
          ],
        });
      }
    } else if (purpose === "login" || purpose === "reset") {
      // For login/reset: must exist
      const where = channel === "email" ? { email: norm } : { phone: norm };
      const exists = await User.findOne({ where });
      if (!exists) {
        return res.status(404).json({ message: "No account found." });
      }
    } else {
      return res.status(400).json({ message: "Unsupported purpose" });
    }
    // --- END NEW ---

    // Basic throttling for OTP request flood
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await OtpCode.count({
      where: { target: norm, created_at: { [Op.gte]: oneHourAgo }, used_at: null },
    });
    if (recentCount >= 5) {
      return res.status(429).json({ message: "Too many OTP requests. Please try later." });
    }

    // Generate & dispatch
    const code = generateOtpCode(); // 6-digit
    if (!DEV_BYPASS) {
      if (channel === "email") {
        await sendEmailOtp(norm, code, purpose);
      } else {
        // NOTE: still routing SMS to email sink for now
        await sendEmailOtp("contract-one@k53tech.com", code, `${purpose} (for ${norm})`);
        // If you later enable real SMS, swap to:
        // await sendSmsOtp(norm, code, purpose);
      }
    } else {
      console.log(`[DEV OTP] ${channel}:${norm} code=${code}`);
    }

    const code_hash = await hashOtp(code);
    const expires_at = new Date(Date.now() + 10 * 60 * 1000);
    await OtpCode.create({
      target: norm,
      channel,
      purpose,
      code_hash,
      expires_at,
      meta: sanitizeProfile(profile) || null,
    });

    return res.json({
      ok: true,
      delivered_to: channel === "email" ? norm : "contract-one@k53tech.com",
      dev: DEV_BYPASS,
      code: DEV_BYPASS && DEV_EXPOSE ? code : undefined,
    });
  } catch (e) {
    const status = e?.status || 400;
    const message = e?.message || "Failed to request OTP";
    return res.status(status).json({ message });
  }
});

// POST /auth/otp/verify
router.post("/otp/verify", async (req, res) => {
  try {
    const { target, channel, purpose, code, profile } = req.body || {};
    if (!target || !channel || !purpose || !code) {
      return res.status(400).json({ message: "target, channel, purpose, code are required" });
    }
    if (!/^\d{6}$/.test(String(code))) {
      return res.status(400).json({ message: "Invalid code format" });
    }

    const norm = normalizeTarget(target, channel);

    const otp = await OtpCode.findOne({
      where: {
        target: norm,
        channel,
        purpose,
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

    const ok = await verifyOtp(String(code), otp.code_hash);
    await otp.update({ attempts: otp.attempts + 1 });

    if (!ok) {
      return res.status(400).json({ message: "Invalid code" });
    }

    await otp.update({ used_at: new Date() });

    let user;
    if (purpose === "register") {
      if (channel === "email") {
        user = await User.findOne({ where: { email: norm } });
        if (!user) {
          user = await User.create({
            email: norm,
            email_verified: true,
            phone_verified: false,
            ...sanitizeProfile(profile),
          });
        } else {
          await user.update({ email_verified: true, ...sanitizeProfile(profile) });
        }
      } else {
        user = await User.findOne({ where: { phone: norm } });
        if (!user) {
          user = await User.create({
            phone: norm,
            phone_verified: true,
            email_verified: false,
            ...sanitizeProfile(profile),
          });
        } else {
          await user.update({ phone_verified: true, ...sanitizeProfile(profile) });
        }
      }
    } else if (purpose === "login" || purpose === "reset") {
      user =
        (channel === "email"
          ? await User.findOne({ where: { email: norm } })
          : await User.findOne({ where: { phone: norm } })) || null;
      if (!user) {
        return res.status(404).json({ message: "No account found." });
      }
    } else {
      return res.status(400).json({ message: "Unsupported purpose" });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    return res.json({ token, user });
  } catch (e) {
    const status = e?.status || 400;
    const message = e?.message || "Failed to verify OTP";
    return res.status(status).json({ message });
  }
});

export default router;
