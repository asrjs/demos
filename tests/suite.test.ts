import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleSuite, createPortalHtml } from "../scripts/build-suite.mjs";
import { createFrameworkSuiteServer } from "../scripts/serve-suite.mjs";

const temporaryDirectories: string[] = [];
const frameworksRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function temporaryDirectory() {
  const temporaryRoot = path.join(frameworksRoot, "tmp");
  await fs.mkdir(temporaryRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(temporaryRoot, "suite-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function get(url: string, requestPath: string) {
  return new Promise<{
    status: number;
    headers: http.IncomingHttpHeaders;
    body: string;
  }>((resolve, reject) => {
    const request = http.get(new URL(requestPath, url), (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () =>
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    request.on("error", reject);
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => {
      const target = path.resolve(directory);
      const parent = path.join(frameworksRoot, "tmp");
      if (
        !target.startsWith(`${parent}${path.sep}`) ||
        !path.basename(target).startsWith("suite-test-")
      ) {
        throw new Error(`Refusing to remove a non-test directory: ${target}`);
      }
      return fs.rm(target, { recursive: true, force: true });
    }),
  );
});

describe("framework suite", () => {
  it("assembles and serves all seven apps on one origin", async () => {
    const root = await temporaryDirectory();
    const apps = await Promise.all(
      [
        "showcase",
        "playground",
        "realtime",
        "benchmark",
        "examples/react",
        "examples/svelte",
        "examples/vue",
      ].map(async (mount, index) => {
        const source = path.join(root, `source-${index}`);
        await fs.mkdir(path.join(source, "assets"), { recursive: true });
        await fs.writeFile(
          path.join(source, "index.html"),
          `<main>${mount}</main>`,
        );
        await fs.writeFile(
          path.join(source, "assets", "app.js"),
          `globalThis.app=${JSON.stringify(mount)};`,
        );
        return [mount, source] as const;
      }),
    );
    const output = path.join(root, "dist");
    await assembleSuite({ apps, outputDir: output });
    expect(
      await fs.readFile(path.join(output, "index.html"), "utf8"),
    ).toContain("/examples/vue/");

    const preview = await createFrameworkSuiteServer({ root: output, port: 0 });
    try {
      const pages = await Promise.all(
        apps.map(([mount]) => get(preview.url, `${mount}/`)),
      );
      expect(pages.map((page) => page.status)).toEqual(apps.map(() => 200));
      for (let index = 0; index < pages.length; index += 1) {
        expect(pages[index].body).toContain(apps[index][0]);
      }
      const asset = await get(preview.url, "examples/react/assets/app.js");
      expect(asset.status).toBe(200);
      expect(asset.headers["content-type"]).toContain("javascript");
      expect(asset.headers["cross-origin-opener-policy"]).toBe("same-origin");
      expect(asset.headers["cross-origin-embedder-policy"]).toBe(
        "require-corp",
      );
      const traversal = await get(preview.url, "/%2e%2e/package.json");
      expect([400, 404]).toContain(traversal.status);
    } finally {
      await preview.close();
    }
  });

  it("validates every source before changing the output", async () => {
    const root = await temporaryDirectory();
    const output = path.join(root, "dist");
    const valid = path.join(root, "valid");
    await fs.mkdir(valid);
    await fs.writeFile(path.join(valid, "index.html"), "<main>ok</main>");
    const apps = [
      ["valid", valid],
      ["missing", path.join(root, "missing")],
    ] as const;

    await expect(assembleSuite({ apps, outputDir: output })).rejects.toThrow(
      "missing or incomplete",
    );
    await expect(fs.access(output)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("renders a minimal portal with a link for each app", () => {
    const html = createPortalHtml([
      ["showcase", "/tmp/showcase"],
      ["examples/react", "/tmp/react"],
    ]);
    expect(html).toContain('aria-label="Applications"');
    expect(html).toContain('href="/showcase/"');
    expect(html).toContain('href="/examples/react/"');
  });
});
