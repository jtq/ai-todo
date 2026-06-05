import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../app.js";

export async function withTestApp<T>(test: (app: Awaited<ReturnType<typeof buildApp>>["app"]) => Promise<T>): Promise<T> {
  const dataDir = mkdtempSync(join(tmpdir(), "ai-todo-"));
  const built = await buildApp({
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    dataDir,
    databaseFilename: "test.sqlite"
  });
  try {
    return await test(built.app);
  } finally {
    await built.app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}
