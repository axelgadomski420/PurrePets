import http from "node:http";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { initSocket } from "./socket/index.js";
import { prisma } from "./prisma.js";

const app = createApp();
const server = http.createServer(app);
initSocket(server, config.corsOrigins);

server.listen(config.port, config.host, () => {
  console.log(`PURRE PETS backend listening on http://${config.host}:${config.port}`);
  console.log(`CORS origins: ${config.corsOrigins.join(", ")}`);
});

async function shutdown(signal) {
  console.log(`
${signal} received — shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
