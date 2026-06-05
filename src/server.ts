import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

const config = loadEnv();
const { app } = await buildApp(config);

const shutdown = async (): Promise<void> => {
  await app.close();
};

process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

await app.listen({ host: config.host, port: config.port });
