# Changesets

Run `npm run changeset` for user-visible changes and commit the generated Markdown file with the code. Select patch for fixes, minor for features, and major for breaking changes. During 0.x development use minor for breaking changes and explain them explicitly.

The Release workflow maintains a version PR. Merge it to accept the version and changelog; npm publication is enabled separately after the initial npm setup. See [release guide](../docs/releasing.md).
