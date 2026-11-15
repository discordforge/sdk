import { defineConfig } from "tsup";
import pkg from "./package.json";

export default defineConfig({
    entry: ["src/cli.ts", "src/index.ts"],
    format: ["cjs"],
    dts: { entry: "src/index.ts" },
    clean: true,
    define: { __CLI_VERSION__: JSON.stringify(pkg.version) }
});
