import * as fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { FileError } from "@earendil-works/pi-durable/env";
import type { WorkspaceBackend } from "../src/core.js";

export const nodeBackend: WorkspaceBackend = {
  async stat(uri) {
    try {
      const s = await fs.stat(fileURLToPath(uri));
      return {
        kind: s.isDirectory() ? "directory" : "file",
        size: s.size,
        mtimeMs: s.mtimeMs,
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw e;
    }
  },
  async read(uri, limit, signal) {
    const h = await fs.open(fileURLToPath(uri), "r");
    try {
      const bytes = new Uint8Array(limit + 1);
      let n = 0;
      while (n < bytes.length) {
        if (signal.aborted) throw new FileError("aborted", "Cancelled");
        const r = await h.read(bytes, n, bytes.length - n, null);
        if (!r.bytesRead) break;
        n += r.bytesRead;
      }
      if (n > limit) throw new FileError("invalid", "File exceeds limit");
      return bytes.slice(0, n);
    } finally {
      await h.close();
    }
  },
  async write(uri, bytes) {
    await fs.writeFile(fileURLToPath(uri), bytes);
  },
  async mkdir(uri, recursive) {
    await fs.mkdir(fileURLToPath(uri), { recursive });
  },
  async names(uri) {
    return fs.readdir(fileURLToPath(uri));
  },
  async remove(uri, recursive) {
    await fs.rm(fileURLToPath(uri), { recursive });
  },
  async move(a, b) {
    await fs.rename(fileURLToPath(a), fileURLToPath(b));
  },
};
