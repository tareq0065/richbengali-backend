import { sequelize } from "../config/sequelize.js";

export async function consumeCredit(userId, type, opts = {}) {
  const t = opts.transaction || null;

  const col =
    type === "superlike"
      ? "superlike_credits"
      : type === "boost"
        ? "boost_credits"
        : "premium_tokens";

  // Use RETURNING and check if we got a row back. If not, there were no credits to consume.
  const [rows] = await sequelize.query(
    `
      UPDATE user_credits
      SET ${col} = ${col} - 1,
          updated_at = now()
      WHERE user_id = :userId
        AND ${col} > 0
        RETURNING user_id, ${col} AS remaining
    `,
    {
      replacements: { userId },
      transaction: t,
    },
  );

  // Depending on dialect/Sequelize version, rows can be an array or a single object.
  const row = Array.isArray(rows) ? rows[0] : rows;

  if (!row) {
    // No row updated ⇒ no credits
    throw Object.assign(new Error("Not enough credits"), { code: "NO_CREDIT", status: 400 });
  }

  return row; // { user_id, remaining }
}
