export const up = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id BIGSERIAL PRIMARY KEY,
      target TEXT NOT NULL,                                   -- email or phone (E.164)
      channel TEXT NOT NULL CHECK (channel IN ('email','phone')),
      purpose TEXT NOT NULL CHECK (purpose IN ('register','login','reset')),
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TIMESTAMP NULL,
      meta JSONB NULL,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_otp_codes_target ON otp_codes (target);
    CREATE INDEX IF NOT EXISTS idx_otp_codes_purpose ON otp_codes (purpose);
    CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON otp_codes (expires_at);
    CREATE INDEX IF NOT EXISTS idx_otp_codes_used_at ON otp_codes (used_at);
    CREATE INDEX IF NOT EXISTS idx_otp_codes_lookup ON otp_codes (target, channel, purpose, used_at, expires_at, created_at);
  `);
};

export const down = async ({ context: qi }) => {
  await qi.sequelize.query(`
    DROP TABLE IF EXISTS otp_codes;
  `);
};
