import { DataTypes } from "sequelize";

export const up = async ({ context: queryInterface }) => {
  await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  await queryInterface.createTable("user_profiles", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: queryInterface.sequelize.literal("uuid_generate_v4()"),
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },

    height_cm: { type: DataTypes.INTEGER, allowNull: true },
    weight_kg: { type: DataTypes.INTEGER, allowNull: true },

    looking_for: { type: DataTypes.STRING, allowNull: true },
    work: { type: DataTypes.STRING, allowNull: true },
    education: { type: DataTypes.STRING, allowNull: true },

    education_level: { type: DataTypes.STRING, allowNull: true },
    drinking: { type: DataTypes.STRING, allowNull: true },
    smoking: { type: DataTypes.STRING, allowNull: true },
    religion: { type: DataTypes.STRING, allowNull: true },

    languages: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    interests: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },

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

  await queryInterface.addIndex("user_profiles", ["user_id"], { unique: true });
};

export const down = async ({ context: queryInterface }) => {
  await queryInterface.dropTable("user_profiles");
};
