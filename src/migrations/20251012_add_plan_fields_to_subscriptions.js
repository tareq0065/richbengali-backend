export const up = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS plan_price_id TEXT NULL,
    ADD COLUMN IF NOT EXISTS plan_interval TEXT NULL,
    ADD COLUMN IF NOT EXISTS plan_slug TEXT NULL;
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
  `);
};
export const down = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE subscriptions
    DROP COLUMN IF EXISTS plan_price_id,
    DROP COLUMN IF EXISTS plan_interval,
    DROP COLUMN IF EXISTS plan_slug;
  `);
};
