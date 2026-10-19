# Releasing to npm

This guide is for the package maintainer. The package is `pi-durable-expo-env`, currently version `0.1.0`, MIT licensed and published as an unscoped public ESM package. Publishing is a separate, explicit owner action; preparing documentation does not publish it.

## Before the first release

1. Confirm the package name and intended npm account. `npm view pi-durable-expo-env --registry=https://registry.npmjs.org/` reads the registry. A 404 means no visible package was found at that moment; it does not reserve the name or guarantee npm will accept it. Authentication and network errors do not prove availability.
2. Add `repository`, `homepage` and `bugs` metadata once the actual source repository exists. Use its real URLs. Without them, npm has no configured source/issue links and relative README links may not navigate correctly on the npm website; the referenced documents remain available in the installed tarball.
3. Review README compatibility limits and the audit findings in [validation.md](validation.md). Android native runtime remains unverified. Do not describe resource export as device testing or claim full POSIX compatibility.
4. Confirm the intended name/version and changelog. A published name/version cannot be reused; use a new version for a later release. Refresh the example's dependency path and lockfile whenever the version or tarball changes.

## Build and inspect

From the repository root:

```sh
npm ci
npm run check
npm pack --dry-run
npm run example:prepare
```

The tarball should contain `package.json`, compiled `dist/` JavaScript and TypeScript declarations, README, LICENSE, CHANGELOG, CONTRIBUTING, and the validation/release documents. It should exclude native build directories, node_modules, credentials, tests, the example application and internal plans.

The `prepack` hook builds the package; `prepublishOnly` runs the complete adapter check when publishing from the project directory. `publishConfig` selects the public npm registry and public access.

Verify the exact tarball through the example:

```sh
cd examples/expo
npm install ./pi-durable-expo-env-0.1.0.tgz
npm ci
npx tsc --noEmit
npm run export
```

Commit any resulting example lockfile update. If native APIs or dependencies changed, also build and run the affected native example; exports alone do not establish runtime behavior.

## Publish manually

When the owner is ready, from the repository root:

```sh
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm publish --dry-run
npm publish --access public
```

Complete npm's account authentication or verification prompts directly. Keep credentials out of source files and command-line arguments. `--dry-run` inspects the proposed publication without uploading it; it does not establish that authentication, ownership or registry policy will permit the real publication.

After publishing, read the registry result:

```sh
npm view pi-durable-expo-env@0.1.0 version dist.integrity --registry=https://registry.npmjs.org/
```

Install that registry version into a separate compatible Expo app and verify the public entry point. Add the matching Git tag and source release when the repository is available. This repository's GitHub Actions workflow checks code and exports; it does not automatically publish to npm.

## References

- [npm publish documentation](https://docs.npmjs.com/cli/v11/commands/npm-publish/)
- [npm package.json documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)
