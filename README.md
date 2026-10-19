# pi-durable-expo-env

An Expo-based mobile execution environment for **Pi Durable 1.3** on Android and iOS, targeting **Expo SDK 58**. The first release provides an app-private filesystem. Reuse Pi's `read`, `write` and `edit` tools through its `ExecutionEnv` interface. The adapter has no Node.js runtime dependency and does not execute shell commands.

An independent community adapter for Pi Durable and Expo. This is not an official package from either project. It can be used by any compatible Expo app; it does not depend on Moose.

Pi Durable manages durable agents and tasks. This package supplies device capabilities through `ExecutionEnv`; it does not provide model authentication, session storage, background scheduling, a terminal or a complete mobile agent application.

## Install

Install into an existing **Expo SDK 58** application:

```sh
npx expo install expo-file-system
npm install pi-durable-expo-env@0.1.0 @earendil-works/pi-durable@1.3.0 @earendil-works/chord@1.3.0
```

The npm command is for the published release. To try a source checkout before publication, run `npm ci && npm run check && npm pack` in this repository, then replace `pi-durable-expo-env@0.1.0` in that command with the generated tarball's path.

| Dependency                       | Supported contract   | Tested version       |
| -------------------------------- | -------------------- | -------------------- |
| Pi Durable                       | `1.3.x`              | `1.3.0`              |
| Expo / expo-file-system          | SDK `58` / `58.x`    | `58.0.15` / `58.0.9` |
| React Native / JavaScript engine | Expo SDK 58 / Hermes | `0.88.0` / Hermes    |

ES modules and TypeScript declarations are included. CommonJS `require()` is not an exported entry point.

Node.js 22.19+ is needed for development tooling, not on the mobile device. This release targets Android/iOS; web and older Expo/Pi versions are not supported. Rebuild your development client after adding native dependencies.

The tested iOS SDK 58 precompiled ExpoFileSystem/ExpoModulesCore pair failed at native launch with a missing symbol. The example uses this workaround:

```sh
npx expo install expo-build-properties
```

Merge into the app's Expo config, then regenerate and rebuild the native client:

```json
{
  "expo": {
    "plugins": [
      ["expo-build-properties", { "ios": { "usePrecompiledModules": false } }]
    ]
  }
}
```

This compiles Expo modules from matching source. It changes native build configuration, so restarting Metro alone is insufficient. See [validation](docs/validation.md) for the original failure and tested configuration.

## Use

```ts
import { createExpoWorkspace } from "pi-durable-expo-env";
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

### Workspace options

`createExpoWorkspace(options)` synchronously creates or reopens a private directory and returns Pi's `ExecutionEnv`.

| Option                | Type      | Default            | Purpose                                                      |
| --------------------- | --------- | ------------------ | ------------------------------------------------------------ |
| `workspaceId`         | `string`  | Required           | Stable identifier for the private workspace                  |
| `maxFileBytes`        | `number`  | `8 * 1024 * 1024`  | Maximum file size accepted by reads and writes               |
| `maxOpenReaderBytes`  | `number`  | `32 * 1024 * 1024` | Retained binary snapshot budget per environment              |
| `maxDirectoryEntries` | `number`  | `10_000`           | Maximum entries in one directory listing                     |
| `readOnly`            | `boolean` | `false`            | Reject file mutations after creating/reopening the workspace |

Numeric limits must be positive safe integers below 2 GiB. Read-only mode still initializes the workspace directory; it is a file-operation policy, not an OS permission boundary.

```ts
const env = createExpoWorkspace({
  workspaceId: "conversation-42",
  maxFileBytes: 2 * 1024 * 1024,
  readOnly: true,
});
```

The root entry also exports `WORKSPACE_ROOT` (`"/workspace"`) and the `ExpoWorkspaceOptions`, `WorkspaceOptions` and `WorkspaceBackend` types. The `/core` entry exports `createWorkspaceEnv` for trusted custom backends without loading Expo native modules.

### Results and lifecycle

Filesystem operations take a Chord context as their final argument and return Pi's `Result<T, FileError>`. Use `getOrThrow()` for exception-based handling or inspect `result.ok` and `result.error.code`. Invalid workspace IDs and limits fail during factory construction; native directory creation can also throw.

Keep an environment alive while its readers or tool calls are in use. Close readers when finished, then call `cleanup(context)` when the owning session or operation finishes. Cleanup invalidates the environment and releases reader resources; it preserves files. Reopen with the same `workspaceId` to access them again.

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
import { createExpoWorkspace } from "pi-durable-expo-env";

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

Use the factory's dedicated app-private workspace. Expo does not expose the lstat/realpath controls needed to prove symlink-safe containment. The adapter is **not a sandbox against hostile native code or external writers** creating symlinks in that directory. The portable `pi-durable-expo-env/core` entry accepts a trusted backend and root URI for custom hosts and testing; the host must maintain those assumptions.

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

## Verification status

- Thirty automated tests cover the adapter, genuine Pi text tools and eight selected upstream reader conformance cases. The complete Pi environment conformance suite is not claimed.
- Pi read/write/edit and eight native checks passed on an iOS 26.2 simulator with Hermes. Physical iOS devices were not tested.
- Android Hermes resource export passed; Android native compilation and emulator/device execution have not been tested.
- Renaming the example changed its native identifiers; native binaries were not rebuilt for that metadata-only change. See the included [validation record](docs/validation.md) for evidence and dependency audit findings.

## Contributing and releasing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and [docs/releasing.md](docs/releasing.md) for package inspection and manual npm release steps. These documents are included in the npm tarball. When browsing the installed package locally, their paths are relative to `node_modules/pi-durable-expo-env/`.

MIT licensed. Pi Durable and Expo retain their respective licenses and ownership.
