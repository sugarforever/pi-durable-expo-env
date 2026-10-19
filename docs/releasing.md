# Releasing to npm

This public ESM package uses **SemVer + Changesets**. Conventional Commit prefixes keep Git history readable; version changes are selected explicitly in changeset files, not inferred from commit messages. The initial version is 0.1.0.

## Everyday workflow

1. Create a branch, make the change, run `npm run check`.
2. For user-visible changes run `npm run changeset`, select the package and bump, and write a user-facing summary. Commit the generated file alongside the implementation. Documentation-only changes need no changeset.
3. Open and merge a pull request. The Check workflow runs tests, portable checks, builds and Expo resource exports (not native device tests).
4. On main, Release creates or updates a version PR containing package version, lockfile and CHANGELOG changes. Review and merge that PR to release.
5. Once npm publishing is enabled, Release publishes unpublished versions, creates version tags and GitHub releases. Never reuse a published version. The workflow can be retried with **Run workflow** on main.

Use patch for fixes, minor for features, and major for breaking changes. While below 1.0, use a minor bump for breaking API changes and describe migration clearly. Keep releases on main; this setup does not configure prerelease channels.

## One-time setup

The repository is https://github.com/sugarforever/pi-durable-expo-env.

- GitHub Settings → Actions → General: allow GitHub Actions to create pull requests. The workflow requests contents and pull-request write permissions.
- npm has no visible package under this name as of 2026-10-19. First publish must establish ownership before configuring a package trusted publisher. A 404 does not reserve a name.
- Review compatibility and audit findings in [validation.md](validation.md), then perform the first publication yourself from this source checkout:

```sh
npm ci
npm run check
npm pack --dry-run
npm login --registry=https://registry.npmjs.org/
npm publish --access public
npm view pi-durable-expo-env@0.1.0 version dist.integrity
```

Complete account authentication/2FA directly. Do not commit tokens. This setup task does not itself publish the initial package.

After the package exists, npm package Settings → Trusted publishing: select GitHub Actions, owner `sugarforever`, repository `pi-durable-expo-env`, workflow filename **`release.yml`** (filename only), no environment. Permit publishing. GitHub-hosted runners use Node 24 and npm 11.5.1+; OIDC supplies short-lived authentication and provenance automatically. No `NPM_TOKEN` secret or `NODE_AUTH_TOKEN` is needed.

Finally add GitHub Actions repository variable **`NPM_PUBLISH_ENABLED=true`**. Run Release manually once to reconcile the initial published version. Until enabled, Release manages version PRs but cannot invoke npm publishing. Enabling this variable authorizes subsequent main-branch releases; merge version PRs only when ready to publish.

## Package and example inspection

```sh
npm ci
npm run check
npm pack --dry-run
npm run example:prepare
```

Check that only compiled dist, package metadata, README, LICENSE, CHANGELOG, CONTRIBUTING and the selected docs ship. Do not include credentials, native build directories or tests.

The example uses a versioned local tarball. After a version bump, generate the current tarball and refresh its dependency and lockfile before installing:

```sh
cd examples/expo
npm install --package-lock-only --ignore-scripts ./pi-durable-expo-env-$(node -p "require('../../package.json').version").tgz
npm ci
npx tsc --noEmit
npm run export
```

CI performs this refresh locally, so future version bumps do not depend on the old tarball. Commit refreshed example metadata when updating the example. Native API changes still require native build/run evidence; resource exports do not establish runtime compatibility.

## References

- [Changesets workflow](https://github.com/changesets/action/tree/v2)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/)
