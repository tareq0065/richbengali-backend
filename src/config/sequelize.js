import { Sequelize } from "sequelize";

export const sequelize = new Sequelize(
  process.env.PGDATABASE,
  process.env.PGUSER,
  process.env.PGPASSWORD,
  {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    dialect: "postgres",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
  },
);

export async function connectDb() {
  await sequelize.authenticate();
}
