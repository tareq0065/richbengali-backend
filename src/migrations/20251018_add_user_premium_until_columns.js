export const up = async ({ context: qi }) => {
  // Ensure user premium-related columns exist to match the User model
  await qi.sequelize.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS premium_until TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS unlimited_superlikes_until TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS has_premium_badge BOOLEAN DEFAULT FALSE;

    -- Optional helper index if you frequently query by premium status
    CREATE INDEX IF NOT EXISTS idx_users_is_premium ON users (is_premium);
  `);
};

export const down = async ({ context: qi }) => {
  // Safely drop only the columns we added in this migration
  await qi.sequelize.query(`
    -- Drop helper index first
    DROP INDEX IF EXISTS idx_users_is_premium;

    ALTER TABLE users
      DROP COLUMN IF EXISTS has_premium_badge,
      DROP COLUMN IF EXISTS unlimited_superlikes_until,
      DROP COLUMN IF EXISTS premium_until,
      DROP COLUMN IF EXISTS is_premium;
  `);
};
