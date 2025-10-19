import { DataTypes } from "sequelize";

export const up = async ({ context: queryInterface }) => {
  // Ensure UUID functions exist (matches your style)
  await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  // If a previous failed run created the ENUM, drop it first (Postgres only)
  if (queryInterface.sequelize.getDialect() === "postgres") {
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_profile_options_type') THEN
          DROP TYPE "enum_profile_options_type";
        END IF;
      END$$;
    `);
  }

  await queryInterface.createTable("profile_options", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: queryInterface.sequelize.literal("uuid_generate_v4()"),
      allowNull: false,
    },
    type: {
      // DB-driven categories
      type: DataTypes.ENUM("looking_for", "education_level", "religion", "language", "interest"),
      allowNull: false,
    },
    slug: { type: DataTypes.STRING(60), allowNull: false }, // stable key stored in user profile
    label: { type: DataTypes.STRING(120), allowNull: false }, // UI label
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    meta: { type: DataTypes.JSONB, allowNull: true },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: queryInterface.sequelize.fn("NOW"),
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: queryInterface.sequelize.fn("NOW"),
    },
  });

  await queryInterface.addIndex("profile_options", ["type", "slug"], {
    unique: true,
    name: "profile_options_type_slug_uq",
  });
  await queryInterface.addIndex("profile_options", ["type", "is_active", "sort_order"]);
};

export const down = async ({ context: queryInterface }) => {
  await queryInterface.dropTable("profile_options");

  // Optional: clean up the ENUM type so future re-runs don't collide
  if (queryInterface.sequelize.getDialect() === "postgres") {
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_profile_options_type";');
  }
};
