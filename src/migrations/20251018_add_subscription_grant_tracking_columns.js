export const up = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS last_granted_period_start TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS last_granted_period_end TIMESTAMP NULL;

    -- Helpful index that already likely exists; keep idempotent here
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
  `);
};

export const down = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE subscriptions
      DROP COLUMN IF EXISTS last_granted_period_end,
      DROP COLUMN IF EXISTS last_granted_period_start;
  `);
};
