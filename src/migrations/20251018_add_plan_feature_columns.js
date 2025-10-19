export const up = async ({ context: qi }) => {
  // Add new plan feature/metadata columns safely if they do not exist
  await qi.sequelize.query(`
    ALTER TABLE plans
      ADD COLUMN IF NOT EXISTS description TEXT NULL,
      ADD COLUMN IF NOT EXISTS superlikes_per_period INTEGER NULL,
      ADD COLUMN IF NOT EXISTS superlike_period TEXT NULL,
      ADD COLUMN IF NOT EXISTS boosts_per_week INTEGER NULL,
      ADD COLUMN IF NOT EXISTS unlimited_swipes BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS see_who_liked BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS priority_support BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS badge BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

    -- Helpful indexes for plan listing and lookups
    CREATE INDEX IF NOT EXISTS idx_plans_active ON plans (active);
    CREATE INDEX IF NOT EXISTS idx_plans_sort_order ON plans (sort_order);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_plans_price_id ON plans (price_id);
  `);
};

export const down = async ({ context: qi }) => {
  // Drop the columns that were added by this migration (safe order)
  await qi.sequelize.query(`
    ALTER TABLE plans
      DROP COLUMN IF EXISTS sort_order,
      DROP COLUMN IF EXISTS active,
      DROP COLUMN IF EXISTS badge,
      DROP COLUMN IF EXISTS priority_support,
      DROP COLUMN IF EXISTS see_who_liked,
      DROP COLUMN IF EXISTS unlimited_swipes,
      DROP COLUMN IF EXISTS boosts_per_week,
      DROP COLUMN IF EXISTS superlike_period,
      DROP COLUMN IF EXISTS superlikes_per_period,
      DROP COLUMN IF EXISTS description;

    -- Indexes will be automatically dropped if tied to dropped columns; drop explicitly otherwise
    DROP INDEX IF EXISTS idx_plans_active;
    DROP INDEX IF EXISTS idx_plans_sort_order;
    -- Do not drop unique on price_id; it may have pre-existed. Only drop if we created it
    -- DROP INDEX IF EXISTS ux_plans_price_id;
  `);
};
