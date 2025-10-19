/** @type {import('umzug').MigrationFn} */
export const up = async ({ context: qi }) => {
  const sql = `
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE,
    password_hash TEXT,
    phone TEXT UNIQUE,
    name TEXT NOT NULL,
    age INT CHECK (age >= 18),
    gender TEXT CHECK (gender IN ('male','female','other')) DEFAULT 'other',
    city TEXT,
    profile_picture_url TEXT,
    fcm_token TEXT,
    is_premium BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS user_relations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    target_id UUID REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT CHECK (kind IN ('like','favorite')),
    created_at TIMESTAMP DEFAULT now(),
    UNIQUE(actor_id, target_id, kind)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id TEXT NOT NULL,
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    created_at TIMESTAMP DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('like','favorite','message','superlike')),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    payload JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT,
    current_period_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS user_credits (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    superlike_credits INT NOT NULL DEFAULT 0,
    boost_credits INT NOT NULL DEFAULT 0,
    premium_tokens INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS user_credit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('superlike','boost','premium')),
    delta INT NOT NULL,
    reason TEXT,
    related_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS user_boosts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    activated_at TIMESTAMP DEFAULT now(),
    expires_at TIMESTAMP NOT NULL
  );
  `;
  await qi.sequelize.query(sql);
};

export const down = async ({ context: qi }) => {
  const sql = `
  DROP TABLE IF EXISTS user_boosts;
  DROP TABLE IF EXISTS user_credit_events;
  DROP TABLE IF EXISTS user_credits;
  DROP TABLE IF EXISTS subscriptions;
  DROP TABLE IF EXISTS notifications;
  DROP TABLE IF EXISTS messages;
  DROP TABLE IF EXISTS user_relations;
  DROP TABLE IF EXISTS users;
  `;
  await qi.sequelize.query(sql);
};
