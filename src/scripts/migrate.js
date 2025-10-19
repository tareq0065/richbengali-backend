import path from "path";
import { fileURLToPath } from "url";
import { Umzug, SequelizeStorage } from "umzug";
import dotenv from "dotenv";
import { sequelize } from "../config/sequelize.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const umzug = new Umzug({
  migrations: { glob: path.join(__dirname, "../migrations/*.js") },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

const cmd = process.argv[2];

async function run() {
  if (cmd === "up") {
    await umzug.up();
  } else if (cmd === "down") {
    await umzug.down({ to: 0 });
  } else if (cmd === "status") {
    const executed = await umzug.executed();
    const pending = await umzug.pending();
    console.log(
      JSON.stringify(
        { executed: executed.map((m) => m.name), pending: pending.map((m) => m.name) },
        null,
        2,
      ),
    );
  } else {
    console.log("Usage: migrate.js [up|down|status]");
    process.exit(1);
  }
  await sequelize.close();
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
