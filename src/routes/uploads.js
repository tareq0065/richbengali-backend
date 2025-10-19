import express from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { uploadToS3 } from "../utils/s3.js";
import { User } from "../models/index.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    /image\/(png|jpe?g|webp)/.test(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Only PNG/JPG/WEBP allowed")),
});

router.post("/profile", requireAuth, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "file required" });
    const { url, key } = await uploadToS3(req.file);
    await User.update({ profile_picture_url: url }, { where: { id: req.user.id } });
    res.json({ url, key });
  } catch (e) {
    next(e);
  }
});

export default router;
