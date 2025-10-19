export const up = async ({ context: qi }) => {
  // widen CHECK constraint to include 'superlike'
  await qi.sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'user_relations'
          AND constraint_name = 'user_relations_kind_check'
      ) THEN
        ALTER TABLE "user_relations" DROP CONSTRAINT "user_relations_kind_check";
      END IF;

      ALTER TABLE "user_relations"
      ADD CONSTRAINT "user_relations_kind_check"
      CHECK (kind IN ('like','favorite','visit','superlike'));
    END$$;
  `);

  /* optional but recommended: ensure one row per (actor,target,kind) */
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_relations_actor_target_kind
      ON user_relations (actor_id, target_id, kind);
  `);
};

export const down = async ({ context: qi }) => {
  await qi.sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'user_relations'
        AND constraint_name = 'user_relations_kind_check'
      ) THEN
        ALTER TABLE "user_relations" DROP CONSTRAINT "user_relations_kind_check";
        ALTER TABLE "user_relations"
        ADD CONSTRAINT "user_relations_kind_check"
        CHECK (kind IN ('like','favorite','visit'));
      END IF;
    END$$;
  `);
};
