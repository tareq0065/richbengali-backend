import express from "express";
import { ProfileOption } from "../models/index.js";

const router = express.Router();

// GET /refs/:type  -> list active options ordered
router.get("/:type", async (req, res, next) => {
  try {
    const { type } = req.params;
    const rows = await ProfileOption.findAll({
      where: { type, is_active: true },
      order: [
        ["sort_order", "ASC"],
        ["label", "ASC"],
      ],
      attributes: ["slug", "label", "meta"],
    });
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

export default router;
