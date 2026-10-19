# Development guide

This standalone MIT package adapts an app-private Expo filesystem to Pi Durable's ExecutionEnv. Read README.md before changing API behavior; read docs/validation.md before making compatibility claims.

- src/core.ts owns portable path handling, bounds, lifecycle and mutation serialization. src/index.ts owns Expo calls. Keep runtime code free of Node imports.
- Add behavior regression tests before fixes. Preserve Pi's Result/FileError contracts; unsupported features must return explicit capability errors.
- The workspace is trusted and private. Expo cannot prove symlink-safe containment. Do not introduce arbitrary native roots or silently claim POSIX semantics.
- After changes run npm run check. For Expo API changes run the independent examples/expo app and distinguish native verification from resource export and Node-backed tests.
- Generated dist/, ios/, android/ and node_modules/ are local artifacts. Run npm run example:prepare before installing the example; refresh its lockfile when the tarball changes. Avoid modifying any sibling application to make this package work.
- Record actual checks in docs/validation.md. Remote URLs and publishing metadata are added only after the owner supplies the repository; do not invent links or publish packages.
