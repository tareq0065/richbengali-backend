import dotenv from "dotenv";
import { connectDb } from "../config/sequelize.js";
import { syncModels } from "../models/index.js";
dotenv.config();
await connectDb();
await syncModels();
console.log("Synced");
process.exit(0);
