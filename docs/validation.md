# Validation record

Date: 2026-10-19. Runtime contracts: Pi Durable/AI/Chord 1.3.0; Expo SDK 58.0.15; expo-file-system 58.0.9; React Native 0.88.0.

## Automated checks

- `npm run check`: TypeScript checking, 30 passing behavior/integration tests, declaration/JavaScript build, and portable bundle evaluation without Node globals.
- Tests use real temporary files through a Node test backend. Genuine Pi `read`, `write` and `edit` implementations are invoked for text files, without a model request.
- Eight unmodified upstream environment conformance cases cover binary byte ranges, line scanning (including BOM/malformed UTF-8), open-file identity across rename, invalid/aborted opens, directory paging, close behavior, invalid paths, and removed entries. The test asserts exactly eight cases were selected. Shell, watch, symlink and other POSIX cases are excluded deliberately; this is not a full environment conformance pass.
- Regression coverage includes traversal/URI/NUL/backslash rejection, Unicode/percent filenames, self-rename, existing-directory destinations, byte limits, shared-root concurrent append, queued cwd/input capture, cancellation, reader lifecycle, read-only mode and directory limits.
- npm tarball is installed into the independent example as a real copy, not a source symlink. This verifies exported entry points and avoids duplicate native modules.
- Expo Doctor: 20/20 checks passed after removing source-link duplication and aligning the Expo patch version.
- iOS and Android Hermes release resources exported successfully. Resource exports are not APK/IPA builds or Android native runtime evidence.

## Native example

The example uses its own bundle ID and synthetic private workspace; it does not alter Moose or access user-selected documents. It runs genuine Pi text tools and native file checks without credentials or network/model calls.

Initial iOS builds linked successfully but launch failed with a missing ExpoModulesCore symbol required by the precompiled ExpoFileSystem framework. The example config uses `expo-build-properties` with `ios.usePrecompiledModules: false` to compile matching Expo module sources. This workaround belongs to the example, not the adapter's public API.

The source-based iOS build succeeded (0 errors, 5 warnings). The installed app ran on the iPhone 17 simulator with iOS 26.2 and Hermes. The UI reported all eight native checks passed: genuine Pi write/edit/read, Unicode and encoded filenames, self-rename preservation, snapshot identity after rename, concurrent append, traversal rejection, directory listing and temporary file creation/removal. No model requests were made.

Android native compilation/device operation and physical iOS-device verification have not been performed. Android support currently has type/API inspection and Hermes resource export evidence only. Background suspension, external document providers, image read/model behavior, filesystem watchers and hostile native symlink writers were not tested and are outside this first release's guarantees.

## Dependency audit

After updating the directly used esbuild development dependency to 0.28.2 and trying non-breaking `npm audit fix`, 22 findings remain (15 high, 7 moderate). Their roots are Expo tooling dependencies on braces/micromatch, node-forge and xcode/uuid, propagated through Metro/Expo/React Native. The suggested force fix downgrades Expo to 44.0.6, incompatible with this adapter's SDK 58 target, so it was not applied. These packages are absent from the adapter's five-module portable bundle; this does not establish safety of the surrounding build tools. Review upstream fixes before a public release. No overrides or advisory suppression were added.

## Release state

Version 0.1.0 is prepared for the owner-provided GitHub repository `sugarforever/pi-durable-expo-env`. SemVer / Changesets 3 and GitHub Actions 2 manage version PRs and releases. npm publishing stays disabled until the initial owner publication and trusted-publisher setup described in releasing.md. No npm publication was performed during setup.

On 2026-10-19, release automation checks passed: 30 tests, type checking, build, portable entry validation, tarball inspection, example tarball installation and both Android/iOS Hermes resource exports. No new native device verification. Changesets 3 avoids the extra advisories introduced by Changesets 2; the root audit remains 22 findings (15 high, 7 moderate), and `npm audit --omit=dev` reports zero.

## Package rename

Renamed the project directory and npm package to `pi-durable-expo-env`. Updated the example's import, package dependency, tarball, app name and native identifiers. After the rename, all 30 tests, type checking, portable bundle evaluation, tarball installation, example type checking and both Hermes exports passed. Native binaries were not rebuilt for this naming-only change; the native runtime evidence above belongs to the original example identifiers.
