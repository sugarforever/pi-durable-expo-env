import type { Context } from "@earendil-works/chord";
import {
  FileError,
  ExecutionError,
  LineScanner,
  ok,
  err,
  getOrThrow,
} from "@earendil-works/pi-durable/env";
import type {
  ExecutionEnv,
  FileInfo,
  BinaryReader,
  DirReader,
  TextLineReader,
  Result,
} from "@earendil-works/pi-durable/env";

/** Trusted host backend. URIs are already encoded; reads must enforce the byte limit. */
export interface WorkspaceBackend {
  stat(
    uri: string,
  ): Promise<
    { kind: "file" | "directory"; size: number; mtimeMs: number } | undefined
  >;
  read(uri: string, maxBytes: number, signal: AbortSignal): Promise<Uint8Array>;
  write(uri: string, bytes: Uint8Array): Promise<void>;
  mkdir(uri: string, recursive: boolean): Promise<void>;
  names(uri: string): Promise<string[]>;
  remove(uri: string, recursive: boolean): Promise<void>;
  move(source: string, destination: string): Promise<void>;
}
export interface WorkspaceOptions {
  backend: WorkspaceBackend;
  /** Dedicated, trusted file:// directory, already created by the host. */
  rootUri: string;
  maxFileBytes?: number;
  maxOpenReaderBytes?: number;
  maxDirectoryEntries?: number;
  readOnly?: boolean;
}
export const WORKSPACE_ROOT = "/workspace";
// Shared only within this JS realm. Native/external writers must not modify the workspace.
const queues = new Map<string, Promise<unknown>>();
async function serial<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(run);
  queues.set(key, pending);
  try {
    return await pending;
  } finally {
    if (queues.get(key) === pending) queues.delete(key);
  }
}
function invalid(message: string): never {
  throw new FileError("invalid", message);
}
function positive(value: number | undefined, fallback: number): number {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 1 || n > 0x7ffffffe)
    invalid("Limits must be positive safe integers below 2 GiB");
  return n;
}
function integer(n: number) {
  if (!Number.isSafeInteger(n) || n < 0)
    invalid("Expected a non-negative safe integer");
}
function segment(s: string) {
  if (!s || s === "." || s === ".." || /[\/\\\0]/.test(s))
    invalid("Invalid filename");
  return s;
}

/** Portable, bounded subset of ExecutionEnv. No Node imports or shell implementation. */
export function createWorkspaceEnv(options: WorkspaceOptions): ExecutionEnv {
  const root = new URL(options.rootUri);
  if (
    root.protocol !== "file:" ||
    root.host ||
    root.search ||
    root.hash ||
    root.username ||
    root.password
  )
    invalid("Expected a local file:// directory");
  const rootUri = root.href.replace(/\/+$/, "");
  const backend = options.backend;
  const maxBytes = positive(options.maxFileBytes, 8 * 1024 * 1024);
  const maxReaders = positive(options.maxOpenReaderBytes, 32 * 1024 * 1024);
  const maxEntries = positive(options.maxDirectoryEntries, 10000);
  let cwd = WORKSPACE_ROOT,
    closed = false,
    readerBytes = 0,
    tempCounter = 0;
  const closers = new Set<() => void>();
  function check(ctx: Context) {
    if (ctx.abortSignal?.aborted)
      throw new FileError("aborted", "Operation cancelled");
    if (closed) invalid("Environment is closed");
  }
  function resolve(path: string, base = cwd): string {
    if (
      typeof path !== "string" ||
      /[\\\0]/.test(path) ||
      /^[a-z][a-z\d+.-]*:/i.test(path)
    )
      invalid("Invalid workspace path");
    const parts = (path.startsWith("/") ? path : `${base}/${path}`).split("/");
    const normalized: string[] = [];
    for (const p of parts) {
      if (!p || p === ".") continue;
      if (p === "..") {
        if (normalized.length <= 1) invalid("Path escapes workspace");
        normalized.pop();
      } else normalized.push(p);
    }
    if (normalized[0] !== "workspace") invalid("Path escapes workspace");
    return "/" + normalized.join("/");
  }
  const uri = (path: string) =>
    rootUri +
    path
      .slice(WORKSPACE_ROOT.length)
      .split("/")
      .map(encodeURIComponent)
      .join("/");
  function error(e: unknown, path?: string): FileError {
    return e instanceof FileError
      ? e
      : new FileError("unknown", "Filesystem operation failed", path);
  }
  async function run<T>(
    ctx: Context,
    fn: () => Promise<T> | T,
  ): Promise<Result<T, FileError>> {
    try {
      check(ctx);
      const v = await fn();
      check(ctx);
      return ok(v);
    } catch (e) {
      return err(error(e));
    }
  }
  async function acquire<T extends { close(ctx: Context): Promise<void> }>(
    ctx: Context,
    fn: () => Promise<T>,
  ): Promise<Result<T, FileError>> {
    let resource: T | undefined;
    try {
      check(ctx);
      resource = await fn();
      check(ctx);
      return ok(resource);
    } catch (e) {
      if (resource) await resource.close(ctx);
      return err(error(e));
    }
  }
  async function mutate<T>(
    ctx: Context,
    fn: (resolve: (path: string) => string) => Promise<T>,
  ): Promise<Result<T, FileError>> {
    const calledCwd = cwd;
    return serial(rootUri, () =>
      run(ctx, async () => {
        if (options.readOnly)
          throw new FileError("permission_denied", "Workspace is read-only");
        return fn((path) => resolve(path, calledCwd));
      }),
    );
  }
  async function stat(path: string) {
    const s = await backend.stat(uri(path));
    if (!s) throw new FileError("not_found", "Path does not exist", path);
    return s;
  }
  async function info(path: string): Promise<FileInfo> {
    return { ...(await stat(path)), path, name: path.split("/").at(-1)! };
  }
  async function directory(path: string) {
    if ((await stat(path)).kind !== "directory")
      throw new FileError("not_directory", "Expected a directory", path);
  }
  async function bytes(path: string, ctx: Context) {
    const s = await stat(path);
    if (s.kind === "directory")
      throw new FileError("is_directory", "Expected a file", path);
    if (s.size > maxBytes) invalid("File exceeds byte limit");
    check(ctx);
    const b = await backend.read(
      uri(path),
      maxBytes,
      ctx.abortSignal ?? new AbortController().signal,
    );
    check(ctx);
    if (b.byteLength > maxBytes) invalid("File exceeds byte limit");
    return b;
  }
  function encode(content: string | Uint8Array) {
    if (typeof content !== "string" && content.byteLength > maxBytes)
      invalid("File exceeds byte limit");
    if (typeof content === "string" && content.length > maxBytes)
      invalid("File exceeds byte limit");
    const b =
      typeof content === "string"
        ? new TextEncoder().encode(content)
        : content.slice();
    if (b.byteLength > maxBytes) invalid("File exceeds byte limit");
    return b;
  }
  async function write(path: string, data: Uint8Array, ctx: Context) {
    if (path === WORKSPACE_ROOT)
      throw new FileError("is_directory", "Cannot write workspace root", path);
    const s = await backend.stat(uri(path));
    if (s?.kind === "directory")
      throw new FileError("is_directory", "Expected a file", path);
    check(ctx);
    await backend.mkdir(uri(path.slice(0, path.lastIndexOf("/"))), true);
    check(ctx);
    await backend.write(uri(path), data);
  }
  function protect(path: string) {
    if (path === WORKSPACE_ROOT)
      invalid("Cannot remove or rename workspace root");
  }
  function unsupported(ctx: Context): Promise<Result<never, FileError>> {
    return run(ctx, () => {
      throw new FileError(
        "not_supported",
        "Capability is unavailable in this Expo adapter",
      );
    });
  }
  async function snapshot(path: string, ctx: Context): Promise<BinaryReader> {
    return serial(rootUri, async () => {
      check(ctx);
      const metadata = await info(path);
      let data: Uint8Array = await bytes(path, ctx);
      check(ctx);
      if (readerBytes + data.length > maxReaders)
        invalid("Open reader byte budget exceeded");
      readerBytes += data.length;
      let done = false;
      const close = () => {
        if (!done) {
          done = true;
          readerBytes -= data.length;
          data = new Uint8Array();
          closers.delete(close);
        }
      };
      closers.add(close);
      const ready = () => {
        if (done) invalid("Reader is closed");
      };
      return {
        info: (c) =>
          run(c, () => {
            ready();
            return { ...metadata, size: data.length };
          }),
        read: (offset, length, c) =>
          run(c, () => {
            ready();
            integer(offset);
            integer(length);
            return data.slice(offset, Math.min(data.length, offset + length));
          }),
        scanLines: (range, c) =>
          run(c, () => {
            ready();
            integer(range.startLine);
            if (range.endLine !== undefined) {
              integer(range.endLine);
              if (range.endLine <= range.startLine)
                invalid("Invalid line range");
            }
            const scanner = new LineScanner(range.startLine, range.endLine);
            scanner.push(data);
            return scanner.finish();
          }),
        async close() {
          close();
        },
      };
    });
  }
  async function temp(
    prefix: string,
    suffix: string,
    isDir: boolean,
    ctx: Context,
  ) {
    if (prefix) segment(prefix);
    if (suffix) segment(suffix);
    const parent = WORKSPACE_ROOT + "/.tmp";
    await backend.mkdir(uri(parent), true);
    check(ctx);
    for (let n = 0; n < 16; n++) {
      const path = `${parent}/${prefix}${Date.now().toString(36)}-${(++tempCounter).toString(36)}-${Math.random().toString(36).slice(2)}${suffix}`;
      if (await backend.stat(uri(path))) continue;
      check(ctx);
      if (isDir) await backend.mkdir(uri(path), false);
      else await backend.write(uri(path), new Uint8Array());
      return path;
    }
    invalid("Unable to allocate temporary path");
  }
  const env: ExecutionEnv = {
    id: `expo-filesystem:${rootUri}`,
    get cwd() {
      return cwd;
    },
    set cwd(value: string) {
      cwd = resolve(value);
    },
    absolutePath: (p, c) => run(c, () => resolve(p)),
    joinPath: (parts, c) =>
      run(c, () => {
        if (
          !Array.isArray(parts) ||
          parts.some(
            (p) =>
              typeof p !== "string" ||
              /[\\\0]/.test(p) ||
              /^[a-z][a-z\d+.-]*:/i.test(p),
          )
        )
          invalid("Invalid path parts");
        return resolve(parts.join("/"));
      }),
    readBinaryFile: (p, c) => run(c, () => bytes(resolve(p), c)),
    readTextFile: (p, c) =>
      run(c, async () => new TextDecoder().decode(await bytes(resolve(p), c))),
    openBinaryReader: (p, o, c) =>
      o?.noFollow ? unsupported(c) : acquire(c, () => snapshot(resolve(p), c)),
    openTextLineReader: (p, c) =>
      acquire(c, async () => {
        const r = await snapshot(resolve(p), c);
        let text: string;
        try {
          text = new TextDecoder().decode(
            getOrThrow(await r.read(0, maxBytes, c)),
          );
        } catch (e) {
          await r.close(c);
          throw e;
        }
        let offset = 0,
          done = false;
        const close = () => {
          done = true;
          text = "";
          closers.delete(close);
        };
        closers.add(close);
        const reader: TextLineReader = {
          readLine: (cc) =>
            run(cc, () => {
              if (done) invalid("Reader is closed");
              if (offset >= text.length) return undefined;
              const end = text.indexOf("\n", offset);
              const terminated = end !== -1;
              const line = text.slice(offset, terminated ? end : text.length);
              offset = terminated ? end + 1 : text.length;
              return {
                text: line.endsWith("\r") ? line.slice(0, -1) : line,
                terminated,
              };
            }),
          async close(cc) {
            close();
            await r.close(cc);
          },
        };
        return reader;
      }),
    readTextLines: (p, o, c) =>
      run(c, async () => {
        if (o?.maxLines !== undefined) integer(o.maxLines);
        const r = getOrThrow(await env.openTextLineReader(p, c));
        try {
          const lines: string[] = [];
          while (lines.length < (o?.maxLines ?? Infinity)) {
            const line = getOrThrow(await r.readLine(c));
            if (!line) break;
            lines.push(line.text);
          }
          return lines;
        } finally {
          await r.close(c);
        }
      }),
    writeFile: (p, content, c) =>
      run(c, () => {
        const path = resolve(p),
          data = encode(content);
        return mutate(c, () => write(path, data, c)).then(getOrThrow);
      }),
    appendFile: (p, content, c) =>
      run(c, () => {
        const path = resolve(p),
          added = encode(content);
        return mutate(c, async () => {
          const s = await backend.stat(uri(path));
          const old = s ? await bytes(path, c) : new Uint8Array();
          if (old.length + added.length > maxBytes)
            invalid("File exceeds byte limit");
          const data = new Uint8Array(old.length + added.length);
          data.set(old);
          data.set(added, old.length);
          await write(path, data, c);
        }).then(getOrThrow);
      }),
    truncateFile: (p, size, c) =>
      mutate(c, async (resolve) => {
        integer(size);
        if (size > maxBytes) invalid("File exceeds byte limit");
        const path = resolve(p);
        const old = await bytes(path, c);
        const data = new Uint8Array(size);
        data.set(old.subarray(0, size));
        await write(path, data, c);
      }),
    flushFile: (_p, c) => unsupported(c),
    canonicalPath: (_p, c) => unsupported(c),
    watch: (_t, _f, c) => unsupported(c),
    renameFile: (a, b, c) =>
      mutate(c, async (resolve) => {
        const source = resolve(a),
          dest = resolve(b);
        protect(source);
        protect(dest);
        await stat(source);
        if (source === dest) return;
        const target = await backend.stat(uri(dest));
        if (target?.kind === "directory")
          throw new FileError(
            "not_supported",
            "Replacing an existing directory is unsupported",
            dest,
          );
        await directory(dest.slice(0, dest.lastIndexOf("/")));
        check(c);
        await backend.move(uri(source), uri(dest));
      }),
    fileInfo: (p, c) => run(c, () => info(resolve(p))),
    exists: (p, c) =>
      run(c, async () => !!(await backend.stat(uri(resolve(p))))),
    listDir: (p, c) =>
      run(c, async () => {
        const reader = getOrThrow(await env.openDirReader(p, c));
        try {
          return getOrThrow(await reader.next(maxEntries, c)).entries;
        } finally {
          await reader.close(c);
        }
      }),
    openDirReader: (p, c) =>
      acquire(c, async () => {
        const path = resolve(p);
        await directory(path);
        let names = await backend.names(uri(path));
        if (names.length > maxEntries) invalid("Directory exceeds entry limit");
        for (const n of names) segment(n);
        let index = 0,
          done = false;
        const close = () => {
          done = true;
          names = [];
          closers.delete(close);
        };
        closers.add(close);
        const reader: DirReader = {
          next: (count, cc) =>
            run(cc, async () => {
              if (done) invalid("Reader is closed");
              integer(count);
              if (!count) invalid("Page size must be positive");
              const entries: FileInfo[] = [];
              while (index < names.length && entries.length < count) {
                check(cc);
                const entry = path + "/" + names[index++];
                try {
                  entries.push(await info(entry));
                } catch (e) {
                  if (!(e instanceof FileError) || e.code !== "not_found")
                    throw e;
                }
              }
              return { entries, done: index === names.length };
            }),
          async close() {
            close();
          },
        };
        return reader;
      }),
    createDir: (p, o, c) =>
      mutate(c, async (resolve) => {
        const path = resolve(p);
        const existing = await backend.stat(uri(path));
        if (existing) {
          if (existing.kind === "directory") return;
          throw new FileError(
            "not_directory",
            "A file occupies this path",
            path,
          );
        }
        if (!o?.recursive)
          await directory(path.slice(0, path.lastIndexOf("/")));
        check(c);
        await backend.mkdir(uri(path), o?.recursive ?? false);
      }),
    remove: (p, o, c) =>
      mutate(c, async (resolve) => {
        const path = resolve(p);
        protect(path);
        const s = await backend.stat(uri(path));
        if (!s) {
          if (o?.force) return;
          throw new FileError("not_found", "Path does not exist", path);
        }
        if (
          s.kind === "directory" &&
          !o?.recursive &&
          (await backend.names(uri(path))).length
        )
          invalid("Directory is not empty");
        check(c);
        await backend.remove(uri(path), o?.recursive ?? false);
      }),
    createTempDir: (prefix, c) =>
      mutate(c, () => temp(prefix ?? "pi-", "", true, c)),
    createTempFile: (o, c) =>
      mutate(c, () => temp(o?.prefix ?? "pi-", o?.suffix ?? "", false, c)),
    async cleanup() {
      await serial(rootUri, async () => {
        closed = true;
        for (const close of [...closers]) close();
      });
    },
    async exec(_command, _options, c) {
      return err(
        new ExecutionError(
          c.abortSignal?.aborted ? "aborted" : "shell_unavailable",
          c.abortSignal?.aborted
            ? "Operation cancelled"
            : "Shell execution is unavailable on this device",
        ),
      );
    },
  };
  return env;
}
