export const up = async ({ context: qi }) => {
  await qi.sequelize.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now(),
      CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets (user_id);
    CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets (expires_at);
    CREATE INDEX IF NOT EXISTS idx_password_resets_used ON password_resets (used_at);
  `);
};

export const down = async ({ context: qi }) => {
  await qi.sequelize.query(`
    DROP TABLE IF EXISTS password_resets;
  `);
};
