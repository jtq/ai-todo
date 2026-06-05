import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

export interface AppConfig {
  nodeEnv: string;
  host: string;
  port: number;
  dataDir: string;
  databaseFilename: string;
}

export function loadEnv(overrides: Record<string, string | undefined> = {}): AppConfig {
  const env = { ...process.env, ...overrides };
  const dataDir = resolve(env.DATA_DIR ?? "./data");
  mkdirSync(dataDir, { recursive: true });
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    host: env.HOST ?? "127.0.0.1",
    port: Number.parseInt(env.PORT ?? "3000", 10),
    dataDir,
    databaseFilename: env.DATABASE_FILENAME ?? "ai-todo.sqlite"
  };
}
