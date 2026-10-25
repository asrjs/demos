import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSuiteServer } from "../../demos/scripts/serve-suite.mjs";

const frameworksRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const DEFAULT_SUITE_PORT = 4190;

export async function createFrameworkSuiteServer({
  root = path.join(frameworksRoot, "dist"),
  host = "127.0.0.1",
  port = DEFAULT_SUITE_PORT,
} = {}) {
  const rootPath = path.resolve(root);
  await fs.access(path.join(rootPath, "index.html"));
  const server = createSuiteServer({ root: rootPath, base: "/" });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  return {
    server,
    url: `http://${host}:${address.port}/`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const port = Number(process.env.PORT ?? DEFAULT_SUITE_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error(`Invalid port: ${process.env.PORT}`);
    const { url } = await createFrameworkSuiteServer({ port });
    console.log(`ASRJS unified preview: ${url}`);
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  }
}
