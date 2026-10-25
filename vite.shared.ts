import { defineConfig, type PluginOption } from "vite";
import { fileURLToPath } from "node:url";

/** Shared assets and cross-origin isolation for all three browser examples. */
export function exampleConfig(
  framework: "react" | "svelte" | "vue",
  plugins: PluginOption[] = [],
) {
  const suite = process.env.ASRJS_SUITE === "1";
  const headers = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  };
  return defineConfig({
    base: suite ? `/examples/${framework}/` : "/",
    root: fileURLToPath(new URL(`./examples/${framework}/`, import.meta.url)),
    publicDir: fileURLToPath(
      new URL("./examples/shared/public/", import.meta.url),
    ),
    plugins,
    worker: { format: "es" },
    esbuild: { jsx: "automatic" },
    build: { outDir: suite ? "dist-suite" : "dist" },
    server: { host: "127.0.0.1", headers },
    preview: { host: "127.0.0.1", headers },
  });
}
