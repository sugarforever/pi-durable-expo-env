import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  BACKGROUND_CONTEXT as ctx,
  withAbortSignal,
} from "@earendil-works/chord/context";
import { getOrThrow } from "@earendil-works/pi-durable/env";
import { createWorkspaceEnv } from "../src/core.js";
import { nodeBackend } from "./backend.js";
it("releases a snapshot if cancellation races with open", async () => {
  const root = await mkdtemp(`${tmpdir()}/pi-expo-cancel-`);
  const ac = new AbortController();
  let cancel = false;
  const env = createWorkspaceEnv({
    rootUri: pathToFileURL(root).href,
    maxOpenReaderBytes: 3,
    backend: {
      ...nodeBackend,
      async read(...args) {
        const data = await nodeBackend.read(...args);
        if (cancel) ac.abort();
        return data;
      },
    },
  });
  try {
    getOrThrow(await env.writeFile("a", "abc", ctx));
    cancel = true;
    expect(
      (
        await env.openBinaryReader(
          "a",
          undefined,
          withAbortSignal(ac.signal, ctx),
        )
      ).ok,
    ).toBe(false);
    cancel = false;
    const reader = getOrThrow(await env.openBinaryReader("a", undefined, ctx));
    await reader.close(ctx);
  } finally {
    await env.cleanup(ctx);
    await rm(root, { recursive: true, force: true });
  }
});
it("line reader handles CRLF and invalidates on cleanup", async () => {
  const root = await mkdtemp(`${tmpdir()}/pi-expo-lines-`);
  const env = createWorkspaceEnv({
    rootUri: pathToFileURL(root).href,
    backend: nodeBackend,
  });
  try {
    getOrThrow(await env.writeFile("a", "one\r\n\nthree", ctx));
    expect(getOrThrow(await env.readTextLines("a", undefined, ctx))).toEqual([
      "one",
      "",
      "three",
    ]);
    const reader = getOrThrow(await env.openTextLineReader("a", ctx));
    await env.cleanup(ctx);
    expect((await reader.readLine(ctx)).ok).toBe(false);
    await reader.close(ctx);
  } finally {
    await env.cleanup(ctx);
    await rm(root, { recursive: true, force: true });
  }
});
