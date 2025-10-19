import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { Umzug, SequelizeStorage } from "umzug";
import { sequelize } from "../config/sequelize.js";
import { connectDb } from "../config/sequelize.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await connectDb();

const seeder = new Umzug({
  migrations: { glob: path.join(__dirname, "../seeders/*.js") },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, modelName: "SequelizeDataSeed" }),
  logger: console,
});

const cmd = process.argv[2] || "up";

if (cmd === "up") await seeder.up();
else if (cmd === "down") await seeder.down({ to: 0 });
else if (cmd === "status") {
  console.log(await seeder.executed());
}

await sequelize.close();
console.log("Seed operation complete");
