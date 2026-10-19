import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  BACKGROUND_CONTEXT,
  withAbortSignal,
} from "@earendil-works/chord/context";
import { getOrThrow } from "@earendil-works/pi-durable/env";
import { createWorkspaceEnv } from "../src/core.js";
import { nodeBackend } from "./backend.js";
const ctx = BACKGROUND_CONTEXT;
let root: string;
let env: ReturnType<typeof createWorkspaceEnv>;
beforeEach(async () => {
  root = await mkdtemp(`${tmpdir()}/pi-expo-`);
  env = createWorkspaceEnv({
    backend: nodeBackend,
    rootUri: pathToFileURL(root).href,
    maxFileBytes: 128,
    maxOpenReaderBytes: 256,
  });
});
afterEach(async () => {
  await env.cleanup(ctx);
  await rm(root, { recursive: true, force: true });
});
const read = async (p: string) => getOrThrow(await env.readTextFile(p, ctx));
it("maps virtual paths, encodes literal percent and supports nested Unicode files", async () => {
  expect(getOrThrow(await env.absolutePath("./a/../你好.txt", ctx))).toBe(
    "/workspace/你好.txt",
  );
  getOrThrow(await env.writeFile("目录/%2e%2e.txt", "你好", ctx));
  expect(await read("目录/%2e%2e.txt")).toBe("你好");
  expect(getOrThrow(await env.listDir("目录", ctx))[0].path).toBe(
    "/workspace/目录/%2e%2e.txt",
  );
});
it.each([
  "../escape",
  "/etc/passwd",
  "/workspace/../../escape",
  "file:///tmp/x",
  "a\\b",
  "a\0b",
])("rejects unsafe path %j", async (p) => {
  const r = await env.writeFile(p, "x", ctx);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe("invalid");
});
it("protects the root from removal and rename", async () => {
  expect((await env.remove("/workspace", { recursive: true }, ctx)).ok).toBe(
    false,
  );
  expect((await env.renameFile("/workspace", "x", ctx)).ok).toBe(false);
});
it("serializes concurrent appends across environments sharing a root", async () => {
  const other = createWorkspaceEnv({
    backend: nodeBackend,
    rootUri: pathToFileURL(root).href,
  });
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      (i % 2 ? env : other).appendFile("count", "x", ctx).then(getOrThrow),
    ),
  );
  expect(await read("count")).toBe("x".repeat(20));
  await other.cleanup(ctx);
});
it("enforces byte limits before writes and bounds snapshots", async () => {
  expect((await env.writeFile("big", "🌲".repeat(33), ctx)).ok).toBe(false);
  getOrThrow(await env.writeFile("ok", "x".repeat(100), ctx));
  const a = getOrThrow(await env.openBinaryReader("ok", undefined, ctx));
  const b = getOrThrow(await env.openBinaryReader("ok", undefined, ctx));
  expect((await env.openBinaryReader("ok", undefined, ctx)).ok).toBe(false);
  await a.close(ctx);
  expect((await env.openBinaryReader("ok", undefined, ctx)).ok).toBe(true);
  await b.close(ctx);
});
it("keeps snapshots stable and never exposes mutable backing bytes", async () => {
  getOrThrow(await env.writeFile("a", "abc", ctx));
  const r = getOrThrow(await env.openBinaryReader("a", undefined, ctx));
  getOrThrow(await env.renameFile("a", "b", ctx));
  getOrThrow(await env.writeFile("b", "new", ctx));
  const bytes = getOrThrow(await r.read(0, 3, ctx));
  bytes[0] = 0;
  expect(new TextDecoder().decode(getOrThrow(await r.read(0, 3, ctx)))).toBe(
    "abc",
  );
  await r.close(ctx);
});
it("truncates and extends with zero bytes", async () => {
  getOrThrow(await env.writeFile("a", "abc", ctx));
  getOrThrow(await env.truncateFile("a", 5, ctx));
  expect([...getOrThrow(await env.readBinaryFile("a", ctx))]).toEqual([
    97, 98, 99, 0, 0,
  ]);
});
it("checks cancellation and closes readers during cleanup without deleting data", async () => {
  getOrThrow(await env.writeFile("a", "abc", ctx));
  const r = getOrThrow(await env.openBinaryReader("a", undefined, ctx));
  const ac = new AbortController();
  ac.abort();
  const canceled = await env.writeFile(
    "a",
    "bad",
    withAbortSignal(ac.signal, ctx),
  );
  expect(canceled.ok).toBe(false);
  if (!canceled.ok) expect(canceled.error.code).toBe("aborted");
  expect(await read("a")).toBe("abc");
  await env.cleanup(ctx);
  expect((await r.info(ctx)).ok).toBe(false);
  const fresh = createWorkspaceEnv({
    backend: nodeBackend,
    rootUri: pathToFileURL(root).href,
  });
  expect(getOrThrow(await fresh.readTextFile("a", ctx))).toBe("abc");
  await fresh.cleanup(ctx);
});
it("reports unsupported POSIX and shell capabilities explicitly", async () => {
  for (const r of [
    await env.flushFile("a", ctx),
    await env.canonicalPath("a", ctx),
    await env.watch([], () => {}, ctx),
    await env.openBinaryReader("a", { noFollow: true }, ctx),
  ]) {
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_supported");
  }
  const r = await env.exec("echo hi", undefined, ctx);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe("shell_unavailable");
});
it("treats self-rename as a no-op and rejects directory destination replacement", async () => {
  getOrThrow(await env.writeFile("a", "keep", ctx));
  let moves = 0;
  const spy = createWorkspaceEnv({
    backend: {
      ...nodeBackend,
      async move(a, b) {
        moves++;
        await nodeBackend.move(a, b);
      },
    },
    rootUri: pathToFileURL(root).href,
  });
  getOrThrow(await spy.renameFile("a", "./a", ctx));
  expect(moves).toBe(0);
  expect(await read("a")).toBe("keep");
  getOrThrow(await env.createDir("dir", undefined, ctx));
  expect((await env.renameFile("a", "dir", ctx)).ok).toBe(false);
  expect(moves).toBe(0);
  await spy.cleanup(ctx);
});
it("captures cwd and write bytes before queueing a mutation", async () => {
  getOrThrow(await env.createDir("old", undefined, ctx));
  getOrThrow(await env.createDir("new", undefined, ctx));
  env.cwd = "/workspace/old";
  const data = new TextEncoder().encode("original");
  const pending = env.writeFile("file", data, ctx);
  env.cwd = "/workspace/new";
  data.fill(0);
  getOrThrow(await pending);
  expect(await read("/workspace/old/file")).toBe("original");
  expect(getOrThrow(await env.exists("/workspace/new/file", ctx))).toBe(false);
});
it("rejects writes in read-only mode and enforces directory limits", async () => {
  const readOnly = createWorkspaceEnv({
    backend: nodeBackend,
    rootUri: pathToFileURL(root).href,
    readOnly: true,
  });
  const r = await readOnly.appendFile("a", "x", ctx);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe("permission_denied");
  await readOnly.cleanup(ctx);
  getOrThrow(await env.writeFile("a", "x", ctx));
  getOrThrow(await env.writeFile("b", "x", ctx));
  const small = createWorkspaceEnv({
    backend: nodeBackend,
    rootUri: pathToFileURL(root).href,
    maxDirectoryEntries: 1,
  });
  expect((await small.listDir(".", ctx)).ok).toBe(false);
  await small.cleanup(ctx);
});
it("rejects oversized binary writes before copying the input", async () => {
  const data = new Uint8Array(129);
  data.slice = () => {
    throw new Error("must not copy");
  };
  const r = await env.writeFile("large", data, ctx);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe("invalid");
});
