export const up = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS plans (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      product_id TEXT NOT NULL,
      price_id TEXT UNIQUE NOT NULL,
      plan_slug TEXT,                         -- e.g. weekly | monthly | yearly | superlike_pack | boost_pack | premium_onetime
      name TEXT,                              -- display name
      description TEXT,                       -- optional
      plan_type TEXT CHECK (plan_type IN ('subscription','one_time')) NOT NULL,
      interval TEXT CHECK (interval IN ('day','week','month','year')) NULL,
      unit_amount INTEGER NOT NULL,           -- amount in cents
      currency TEXT NOT NULL,
      grants_chat BOOLEAN DEFAULT FALSE,      -- true for subscription packages
      credit_type TEXT CHECK (credit_type IN ('superlike','boost','premium')) NULL,
      credit_quantity INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_plans_active ON plans (active, sort_order);
    CREATE INDEX IF NOT EXISTS idx_plans_slug ON plans (plan_slug);
  `);
};

export const down = async ({ context: qi }) => {
  await qi.sequelize.query(`DROP TABLE IF EXISTS plans;`);
};
