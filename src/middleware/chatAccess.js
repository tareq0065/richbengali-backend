import { Op } from "sequelize";
import { Subscription } from "../models/index.js";

export async function hasChatAccess(userId) {
  const sub = await Subscription.findOne({
    where: {
      user_id: userId,
      status: { [Op.in]: ["active", "trialing"] },
    },
    // ✅ use fields that exist
    order: [
      ["current_period_end", "DESC"],
      ["created_at", "DESC"],
    ],
  });
  if (!sub) return false;

  // If you also gate by plan, keep that logic here
  return true;
}

export async function requireChatAccess(req, res, next) {
  if (await hasChatAccess(req.user.id)) return next();
  return res.status(402).json({
    message: "Chat requires an active subscription. Please subscribe to continue.",
    redirect: "/subscription",
  });
}
