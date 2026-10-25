import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const frameworksRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.dirname(frameworksRoot);

export const SUITE_APPS = Object.freeze([
  ["showcase", path.join(repositoryRoot, "demos", "dist", "showcase")],
  ["playground", path.join(repositoryRoot, "demos", "dist", "playground")],
  ["realtime", path.join(repositoryRoot, "demos", "dist", "realtime")],
  ["benchmark", path.join(repositoryRoot, "demos", "dist", "benchmark")],
  [
    "examples/react",
    path.join(frameworksRoot, "examples", "react", "dist-suite"),
  ],
  [
    "examples/svelte",
    path.join(frameworksRoot, "examples", "svelte", "dist-suite"),
  ],
  ["examples/vue", path.join(frameworksRoot, "examples", "vue", "dist-suite")],
]);

function assertContained(parent, candidate) {
  const relative = path.relative(parent, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Refusing to operate outside the suite workspace: ${candidate}`,
    );
  }
}

async function validateSources(apps) {
  for (const [mount, source] of apps) {
    const resolved = path.resolve(source);
    assertContained(repositoryRoot, resolved);
    const info = await fs.stat(resolved).catch(() => null);
    const indexInfo = await fs
      .stat(path.join(resolved, "index.html"))
      .catch(() => null);
    if (!info?.isDirectory() || !indexInfo?.isFile()) {
      throw new Error(
        `Suite input is missing or incomplete for ${mount}: ${resolved}/index.html`,
      );
    }
  }
}

export function createPortalHtml(apps = SUITE_APPS, stylesheetLinks = "") {
  const names = {
    showcase: "Showcase",
    playground: "Playground",
    realtime: "Realtime",
    benchmark: "Benchmark",
    "examples/react": "React",
    "examples/svelte": "Svelte",
    "examples/vue": "Vue",
  };
  const links = apps
    .map(([mount]) => `<a href="/${mount}/">${names[mount] ?? mount}</a>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ASRJS</title>
${stylesheetLinks}
<style>nav{display:grid;gap:.75rem}nav a{display:block;padding:.85rem 1rem;border:1px solid #b7b7a4;border-radius:.5rem;color:inherit;text-decoration:none}nav a:hover{background:#b7b7a426}</style></head>
<body><main><h1>ASRJS</h1><nav aria-label="Applications">${links}</nav></main></body>
</html>
`;
}

export async function assembleSuite({
  apps = SUITE_APPS,
  outputDir = path.join(frameworksRoot, "dist"),
} = {}) {
  // Check every source before making or changing any output directory.
  await validateSources(apps);
  const destination = path.resolve(outputDir);
  assertContained(frameworksRoot, destination);
  const stagingRoot = path.join(frameworksRoot, "tmp");
  await fs.mkdir(stagingRoot, { recursive: true });
  const stage = path.join(stagingRoot, `suite-stage-${randomUUID()}`);
  const backup = path.join(stagingRoot, `suite-backup-${randomUUID()}`);
  assertContained(stagingRoot, stage);
  assertContained(stagingRoot, backup);

  try {
    await fs.mkdir(stage);
    for (const [mount, source] of apps) {
      const target = path.join(stage, ...mount.split("/"));
      assertContained(stage, target);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.cp(path.resolve(source), target, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    }
    const react = apps.find(([mount]) => mount === "examples/react");
    const stylesheetLinks = react
      ? (
          (await fs.readFile(path.join(react[1], "index.html"), "utf8")).match(
            /<link\b[^>]*\brel="stylesheet"[^>]*>/g,
          ) ?? []
        ).join("\n")
      : "";
    await fs.writeFile(
      path.join(stage, "index.html"),
      createPortalHtml(apps, stylesheetLinks),
      "utf8",
    );

    const existing = await fs.lstat(destination).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing) {
      if (existing.isSymbolicLink() || !existing.isDirectory()) {
        throw new Error(
          `Refusing to replace a non-directory suite output: ${destination}`,
        );
      }
      await fs.rename(destination, backup);
    }
    try {
      await fs.rename(stage, destination);
    } catch (error) {
      if (existing) await fs.rename(backup, destination);
      throw error;
    }
    return destination;
  } finally {
    // Keep any backup as a recoverable snapshot; discard only our unique stage.
    assertContained(stagingRoot, stage);
    await fs.rm(stage, { recursive: true, force: true });
  }
}

function buildFrameworkExamples() {
  const windows = process.platform === "win32";
  const command = windows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const args = windows
    ? ["/d", "/s", "/c", "npm run build:examples"]
    : ["run", "build:examples"];
  const result = spawnSync(command, args, {
    cwd: frameworksRoot,
    env: { ...process.env, ASRJS_SUITE: "1" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Framework example build failed with status ${result.status}`,
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    if (process.argv.slice(2).includes("--build-frameworks"))
      buildFrameworkExamples();
    const output = await assembleSuite();
    console.log(`ASRJS suite assembled at ${output}`);
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  }
}
