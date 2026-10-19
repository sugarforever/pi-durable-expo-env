# pi-expo-filesystem

App-private filesystem support for **Pi Durable 1.3** on **Expo SDK 58**, Android and iOS. Reuse Pi's `read`, `write` and `edit` tools through its `ExecutionEnv` interface. The adapter has no Node.js runtime dependency and does not execute shell commands.

This project is independent of Moose and can be used by other Expo applications. Version 0.1.0 is a local, unpublished release; the package name is provisional until registry availability is checked.

## Install

Until published, build and install a local tarball:

```sh
npm ci
npm run check
npm pack
# In your Expo SDK 58 application:
npx expo install expo-file-system
npm install /path/to/pi-expo-filesystem-0.1.0.tgz @earendil-works/pi-durable@1.3.0
```

Node.js 22.19+ is needed for development tooling, not on the mobile device. This release targets Android/iOS; web and older Expo/Pi versions are not supported. Rebuild your development client after adding native dependencies.

The iOS example compiles Expo modules from source using `expo-build-properties` (`ios.usePrecompiledModules: false`), because the tested SDK 58 precompiled ExpoFileSystem/ExpoModulesCore pair failed at launch. See [validation](docs/validation.md) for the exact result and workaround.

## Use

```ts
import { createExpoWorkspace } from "pi-expo-filesystem";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { getOrThrow } from "@earendil-works/pi-durable/env";

const env = createExpoWorkspace({ workspaceId: "notes" });
getOrThrow(
  await env.writeFile("hello.txt", "Hello from Expo", BACKGROUND_CONTEXT),
);
console.log(
  getOrThrow(
    await env.readTextFile("/workspace/hello.txt", BACKGROUND_CONTEXT),
  ),
);
await env.cleanup(BACKGROUND_CONTEXT);
```

The factory creates `Paths.document/pi-workspaces/<workspaceId>`. IDs contain 1–64 ASCII letters, digits, hyphens or underscores. The model sees only `/workspace` paths. Relative paths use `env.cwd`, initially `/workspace`; absolute paths must remain within that root. `..` cannot cross the root. URI paths, backslashes and NUL are rejected. Unicode and literal percent characters are supported.

### Pi tool integration

Register only the tools you intend to offer:

```ts
import {
  createRegistry,
  defineExtension,
  Harness,
} from "@earendil-works/pi-durable";
import {
  createReadTool,
  createWriteTool,
  createEditTool,
} from "@earendil-works/pi-durable/tools";
import { createExpoWorkspace } from "pi-expo-filesystem";

const registry = createRegistry();
registry.install(
  defineExtension({
    name: "mobile-files",
    tools: [createReadTool(), createWriteTool(), createEditTool()],
  }),
);

// storage, models and context belong to the host application.
const harness = await Harness.open(
  storage,
  {
    models,
    registry,
    env: ({ cwd }) => {
      const env = createExpoWorkspace({ workspaceId: "notes" });
      if (cwd) env.cwd = cwd;
      return env;
    },
  },
  context,
);
```

A stable workspace ID reopens the same files. Pick a separate ID per conversation when isolation between conversations is required. Registering `CodingTools` would also advertise bash; use the explicit tools above. The host still owns Pi runtime bundling, Hermes polyfills, model transport and durable session storage. This package does not add a second scheduler or promise replacement.

Pi's `read` tool handles supported small images using its own logic. Image resizing, image processor integration and image-model behavior are outside this release's tested scope.

## Capabilities and limits

| Capability                                              | Behavior                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Text/binary reads, write, append, truncate              | Supported, bounded; writes create parent directories                            |
| Metadata, directories, paged directory reads            | Supported; directory names are snapshotted at open; removed entries are skipped |
| Rename, remove, temporary files/directories             | Supported within the workspace; existing directory replacement is rejected      |
| Binary/line readers                                     | Immutable in-memory snapshots; survive rename/replacement; close is idempotent  |
| Cancellation                                            | Returns `aborted` before work and between async steps                           |
| Read-only mode                                          | `readOnly: true` rejects mutations with `permission_denied`                     |
| `canonicalPath`, `noFollow: true`, `flushFile`, `watch` | Return `not_supported`                                                          |
| `exec`                                                  | Returns `shell_unavailable` (or `aborted`)                                      |
| Optional `listFiles`, gitignore-aware search            | Not implemented                                                                 |

Defaults: **8 MiB per file**, **32 MiB of retained open binary snapshots per environment**, **10,000 entries per directory**. Configure with `maxFileBytes`, `maxOpenReaderBytes`, `maxDirectoryEntries`. These are operation/snapshot bounds, not a total process memory or disk quota. Text decoding and concurrent direct reads allocate additional memory. Native directory enumeration materializes names before the entry bound can be checked.

Mutations sharing one physical root are serialized within the same JavaScript realm. This protects append/read-modify-write from other adapter instances in that realm. It does not lock another process or a native writer. Whole-file writes and rename behavior follow Expo; there is no atomic transaction, fsync guarantee or crash-proof write protocol. Cancellation after a native operation started may report `aborted` even though the mutation committed. Do not retry non-idempotent operations blindly.

`cleanup()` closes readers and invalidates that environment. It preserves workspace files, including temporary paths; remove temporary files explicitly after use. App uninstall can remove the workspace. OS backup policy is the host app's responsibility.

## Trust boundary

Use the factory's dedicated app-private workspace. Expo does not expose the lstat/realpath controls needed to prove symlink-safe containment. The adapter is **not a sandbox against hostile native code or external writers** creating symlinks in that directory. The portable `pi-expo-filesystem/core` entry accepts a trusted backend and root URI for custom hosts and testing; the host must maintain those assumptions.

The package requests no permissions and exposes no arbitrary-root picker. To import a user document, let the app invoke the system document picker and copy selected bytes into the workspace, respecting size limits. Android `content://`, iOS security-scoped bookmarks, shared folders, search services and Skill script execution need separate host integrations. Model-visible files may be sent to the configured model provider; the app should make that behavior clear to users.

## Development and example

```sh
npm ci
npm run check
npm run example:prepare
cd examples/expo
npm ci
npm run ios     # Xcode/macOS
# or npm run android with an Android SDK and emulator/device
```

The independent example runs synthetic native filesystem checks automatically and has a rerun button. No model key, account or network call is required. It installs the root package tarball generated by `example:prepare`, exercising the same entry points as a consumer. See [validation](docs/validation.md) for tested platforms and remaining limits, and [contributing](CONTRIBUTING.md) for the workflow.

MIT licensed.
