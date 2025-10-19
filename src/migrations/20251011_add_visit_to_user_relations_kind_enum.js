export const up = async ({ context: queryInterface }) => {
  // 1) If your column is a Postgres ENUM type (most Sequelize setups):
  await queryInterface.sequelize.query(`
    DO $$
    DECLARE
      enum_type_name text := 'enum_user_relations_kind';
      has_enum boolean;
      has_visit boolean;
    BEGIN
      -- Check if the enum type exists
      SELECT EXISTS (
        SELECT 1
        FROM pg_type t
        WHERE t.typname = enum_type_name
      ) INTO has_enum;

      IF has_enum THEN
        -- Check if 'visit' already exists
        SELECT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = enum_type_name
            AND e.enumlabel = 'visit'
        ) INTO has_visit;

        IF NOT has_visit THEN
          EXECUTE format('ALTER TYPE %I ADD VALUE %L', enum_type_name, 'visit');
        END IF;
      END IF;
    END$$;
  `);

  // 2) If your column is TEXT/VARCHAR constrained by a CHECK: rebuild with 'visit'
  await queryInterface.sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
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

export const down = async ({ context: queryInterface }) => {
  // Usually we leave enum additions as-is because Postgres can't drop enum values easily.
  // But if you used a CHECK constraint, you can narrow it back:
  await queryInterface.sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'user_relations'
          AND constraint_name = 'user_relations_kind_check'
      ) THEN
        ALTER TABLE "user_relations" DROP CONSTRAINT "user_relations_kind_check";
        ALTER TABLE "user_relations"
        ADD CONSTRAINT "user_relations_kind_check"
        CHECK (kind IN ('like','favorite'));
      END IF;
    END$$;
  `);
};
