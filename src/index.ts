import { Directory, File, FileMode, Paths } from "expo-file-system";
import { FileError } from "@earendil-works/pi-durable/env";
import {
  createWorkspaceEnv,
  type WorkspaceBackend,
  type WorkspaceOptions,
} from "./core.js";
export { WORKSPACE_ROOT } from "./core.js";
export type { WorkspaceOptions, WorkspaceBackend } from "./core.js";
export interface ExpoWorkspaceOptions extends Omit<
  WorkspaceOptions,
  "backend" | "rootUri"
> {
  /** Stable app-owned workspace identifier, 1–64 ASCII letters, digits, _ or -. */
  workspaceId: string;
}
const backend: WorkspaceBackend = {
  async stat(uri) {
    const path = Paths.info(uri);
    if (!path.exists) return undefined;
    const kind = path.isDirectory ? "directory" : "file";
    const details = path.isDirectory
      ? new Directory(uri).info()
      : new File(uri).info();
    return {
      kind,
      size: details.size ?? 0,
      mtimeMs: details.modificationTime ?? 0,
    };
  },
  async read(uri, limit, signal) {
    const handle = new File(uri).open(FileMode.ReadOnly);
    try {
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        if (signal.aborted)
          throw new FileError("aborted", "Operation cancelled");
        const chunk = await handle.readBytes(
          Math.min(65536, limit + 1 - total),
        );
        if (!chunk.length) break;
        total += chunk.length;
        if (total > limit)
          throw new FileError("invalid", "File exceeds byte limit");
        chunks.push(chunk);
      }
      const data = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }
      return data;
    } finally {
      handle.close();
    }
  },
  async write(uri, data) {
    await new File(uri).write(data);
  },
  async mkdir(uri, recursive) {
    new Directory(uri).create({
      intermediates: recursive,
      idempotent: recursive,
    });
  },
  async names(uri) {
    return new Directory(uri).list().map((entry) => entry.name);
  },
  async remove(uri) {
    if (Paths.info(uri).isDirectory) new Directory(uri).delete();
    else new File(uri).delete();
  },
  async move(source, destination) {
    if (Paths.info(source).isDirectory)
      await new Directory(source).move(new Directory(destination), {
        overwrite: true,
      });
    else
      await new File(source).move(new File(destination), { overwrite: true });
  },
};
/** Creates an app-private workspace. Does not request permission or launch a picker. */
export function createExpoWorkspace(options: ExpoWorkspaceOptions) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(options.workspaceId))
    throw new FileError("invalid", "Invalid workspaceId");
  const root = new Directory(
    Paths.document,
    "pi-workspaces",
    options.workspaceId,
  );
  root.create({ intermediates: true, idempotent: true });
  return createWorkspaceEnv({ ...options, rootUri: root.uri, backend });
}
