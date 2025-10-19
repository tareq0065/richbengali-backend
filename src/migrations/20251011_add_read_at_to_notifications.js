export const up = async ({ context: qi }) => {
  await qi.sequelize.query(`
    ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMP NULL;
  `);

  await qi.sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
      ON notifications (user_id, is_read, created_at DESC);
  `);
};

export const down = async ({ context: qi }) => {
  await qi.sequelize.query(`
    DROP INDEX IF EXISTS idx_notifications_user_unread;
  `);
  await qi.sequelize.query(`
    ALTER TABLE notifications
    DROP COLUMN IF EXISTS read_at;
  `);
};
