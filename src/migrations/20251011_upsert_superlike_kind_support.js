export const up = async ({ context: qi }) => {
  // 1) If column is ENUM, add the missing values (outside explicit tx)
  //    We discover the enum type name bound to "user_relations.kind".
  await qi.sequelize.query(`
    DO $$
    DECLARE
      enum_typename text;
      is_enum boolean := false;
    BEGIN
      SELECT t.typname
      INTO enum_typename
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_type  t ON t.oid = a.atttypid
      WHERE c.relname = 'user_relations'
        AND a.attname = 'kind';

      -- If the type is an enum, pg_type.typtype = 'e'
      SELECT (t.typtype = 'e') INTO is_enum
      FROM pg_type t
      WHERE t.typname = enum_typename;

      IF is_enum THEN
        -- add 'visit'
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = enum_typename
            AND e.enumlabel = 'visit'
        ) THEN
          EXECUTE format('ALTER TYPE %I ADD VALUE %L', enum_typename, 'visit');
        END IF;

        -- add 'superlike'
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = enum_typename
            AND e.enumlabel = 'superlike'
        ) THEN
          EXECUTE format('ALTER TYPE %I ADD VALUE %L', enum_typename, 'superlike');
        END IF;
      END IF;
    END$$;
  `);

  // 2) If there's a CHECK constraint, rebuild it to include both 'visit' and 'superlike'
  await qi.sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'user_relations'
          AND constraint_name = 'user_relations_kind_check'
          AND constraint_type = 'CHECK'
      ) THEN
        ALTER TABLE "user_relations" DROP CONSTRAINT "user_relations_kind_check";
      END IF;

      -- Recreate with the full allowed set
      ALTER TABLE "user_relations"
      ADD CONSTRAINT "user_relations_kind_check"
      CHECK (kind IN ('like','favorite','visit','superlike'));
    END$$;
  `);

  // 3) Ensure the uniqueness (prevents duplicates)
  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_relations_actor_target_kind
    ON user_relations (actor_id, target_id, kind);
  `);
};

export const down = async ({ context: qi }) => {
  // We don't try to remove enum values (not supported cleanly).
  // For CHECK constraint we can narrow it back if needed.
  await qi.sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'user_relations'
          AND constraint_name = 'user_relations_kind_check'
          AND constraint_type = 'CHECK'
      ) THEN
        ALTER TABLE "user_relations" DROP CONSTRAINT "user_relations_kind_check";
        ALTER TABLE "user_relations"
        ADD CONSTRAINT "user_relations_kind_check"
        CHECK (kind IN ('like','favorite','visit'));
      END IF;
    END$$;
  `);
};
