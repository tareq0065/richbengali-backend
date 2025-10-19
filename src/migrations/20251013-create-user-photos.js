import { DataTypes } from "sequelize";

export const up = async ({ context: queryInterface }) => {
  // ensure uuid functions exist
  await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  await queryInterface.createTable("user_photos", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: queryInterface.sequelize.literal("uuid_generate_v4()"),
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    url: { type: DataTypes.STRING, allowNull: false },
    storage_key: { type: DataTypes.STRING, allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    is_primary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
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

  await queryInterface.addIndex("user_photos", ["user_id"]);
  await queryInterface.addIndex("user_photos", ["user_id", "sort_order"]);
};

export const down = async ({ context: queryInterface }) => {
  await queryInterface.dropTable("user_photos");
};
