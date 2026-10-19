import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { getOrThrow } from "@earendil-works/pi-durable/env";
import {
  createEnvConformance,
  createExpectAssertions,
} from "@earendil-works/pi-durable/testing";
import {
  createReadTool,
  createWriteTool,
  createEditTool,
} from "@earendil-works/pi-durable/tools";
import { createWorkspaceEnv } from "../src/core.js";
import { nodeBackend } from "./backend.js";
const ctx = BACKGROUND_CONTEXT;
async function withEnv(
  use: Parameters<typeof createEnvConformance>[0]["withEnv"] extends (
    use: infer U,
  ) => unknown
    ? U
    : never,
) {
  const root = await mkdtemp(`${tmpdir()}/pi-expo-tools-`);
  const env = createWorkspaceEnv({
    backend: nodeBackend,
    rootUri: pathToFileURL(root).href,
  });
  try {
    await use(env);
  } finally {
    await env.cleanup(ctx);
    await rm(root, { recursive: true, force: true });
  }
}
const cases = createEnvConformance({
  assertions: createExpectAssertions(expect),
  withEnv,
  symlinks: false,
  listFiles: false,
});
// Explicit subset: shell, watch, symlink and POSIX semantics are intentionally unsupported.
const readers = cases.filter(
  (c) =>
    c.name.startsWith("binary reader ") ||
    c.name.startsWith("directory reader "),
);
it("selects the expected eight upstream reader cases", () =>
  expect(readers).toHaveLength(8));
for (const c of readers) it(`upstream: ${c.name}`, c.run);
it("executes the genuine Pi write, edit and read tool implementations", () =>
  withEnv(async (env) => {
    const write = createWriteTool(),
      edit = createEditTool(),
      read = createReadTool();
    // These text-only tool paths use only env. Other ToolAPI capabilities are deliberately absent.
    const api = { env } as Parameters<NonNullable<typeof write.execute>>[1];
    await write.execute!(
      { path: "notes/hello.txt", content: "Hello Expo\n" },
      api,
      ctx,
    );
    await edit.execute!(
      {
        path: "notes/hello.txt",
        edits: [{ oldText: "Hello", newText: "你好" }],
      },
      api,
      ctx,
    );
    const result = await read.execute!({ path: "notes/hello.txt" }, api, ctx);
    expect(JSON.stringify(result)).toContain("你好 Expo");
    expect(getOrThrow(await env.readTextFile("notes/hello.txt", ctx))).toBe(
      "你好 Expo\n",
    );
  }));
