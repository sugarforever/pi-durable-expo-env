# Contributing

Use Node.js 22.19 or newer, then run `npm ci` and `npm run check` at the root. Add regression tests before changing behavior. Native API changes also need the Expo example to be built and exercised on the affected platform. Root tests use a real temporary Node filesystem as a backend; they do not prove native compatibility.

Keep the portable core free of Node and Expo imports. Put Expo API calls in `src/index.ts`. Reuse Pi's tools and `ExecutionEnv` contracts rather than maintaining a fork. Preserve the private-workspace trust boundary and explicit unsupported capabilities. Document behavior changes and actual verification results.

Before publishing, check the npm name, add repository metadata, review dependency audit findings and run `npm pack --dry-run`. Publishing and remote pushes require the project owner's release instruction.

For the exact publication procedure, see [docs/releasing.md](docs/releasing.md). The package includes this guide and the validation record so installed users can read them without a source-repository URL.
