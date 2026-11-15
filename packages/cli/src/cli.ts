#!/usr/bin/env node
import { processIO, run } from "./run";

run(process.argv.slice(2), processIO()).then((code) => {
    process.exitCode = code;
});
