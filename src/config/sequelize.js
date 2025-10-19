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
    pool: { max: 10, min: 0, idle: 10000, acquire: 60000 },
    dialectOptions: {
      ssl: {
        require: true,
        // Start with false to get running; switch to true after adding the AWS CA bundle
        rejectUnauthorized: false,
      },
    },
  },
);

export async function connectDb() {
  await sequelize.authenticate();
}
