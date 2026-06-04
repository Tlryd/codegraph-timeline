import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli";

test("parseArgs parses scan command options", () => {
  assert.deepEqual(parseArgs(["scan", ".", "--limit", "3", "--target-dir", "src", "--output", "out.json"]), {
    command: "scan",
    repoPath: ".",
    limit: 3,
    targetDir: "src",
    outputPath: "out.json",
    help: false,
  });
});

test("parseArgs parses serve command options", () => {
  assert.deepEqual(parseArgs(["serve", "--data-dir", "data", "--host", "127.0.0.1", "--port", "5000"]), {
    command: "serve",
    dataDir: "data",
    host: "127.0.0.1",
    port: 5000,
    help: false,
  });
});

test("parseArgs rejects invalid limits", () => {
  assert.throws(() => parseArgs(["scan", ".", "--limit", "0"]), /positive integer/);
});
