import "dotenv/config";

import http from "http";
import app from "./app.js";
import { devLog } from "./utils/devlog.js";
import { setupSockets } from "./sockets/index.js";
import { connectDb } from "./config/sequelize.js";

const server = http.createServer(app);
setupSockets(server, app);

const PORT = process.env.PORT || 8080;

(async () => {
  await connectDb();
  server.listen(PORT, () =>
    devLog(`API listening on http://localhost:${PORT} (env: ${process.env.NODE_ENV || "unknown"})`),
  );
})();
