import { build } from "esbuild";
import { builtinModules } from "node:module";
import vm from "node:vm";
const result = await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "PiDurableExpoEnv",
  platform: "browser",
  target: "es2022",
  external: ["expo-file-system"],
  metafile: true,
});
const forbidden = Object.keys(result.metafile.inputs).filter(
  (path) => builtinModules.includes(path) || path.startsWith("node:"),
);
if (forbidden.length)
  throw new Error(`Node dependencies: ${forbidden.join(", ")}`);
// Loading the bundle without Node globals must only require the injected native module.
const context = vm.createContext({
  URL,
  TextEncoder,
  TextDecoder,
  AbortController,
  Uint8Array,
  console,
  require(name) {
    if (name === "expo-file-system") return {};
    throw new Error(`Unexpected dependency: ${name}`);
  },
});
vm.runInContext(result.outputFiles[0].text, context);
console.log(
  `Portable entry verified: ${Object.keys(result.metafile.inputs).length} modules, no Node runtime dependencies.`,
);
