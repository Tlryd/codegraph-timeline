import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { buildImportGraph, calculateDegreeMetrics, parseImportSpecifiers } from "../src/importGraph";

test("parseImportSpecifiers finds static and side-effect imports", () => {
  const specifiers = parseImportSpecifiers(`
    import fs from "node:fs";
    import type { Thing } from "./types";
    import { a } from './a';
    import "./setup";
  `);

  assert.deepEqual(specifiers, ["node:fs", "./types", "./a", "./setup"]);
});

test("buildImportGraph creates edges for resolved relative TS/JS imports", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codegraph-timeline-test-"));

  try {
    await mkdir(path.join(root, "src", "lib"), { recursive: true });
    await writeFile(path.join(root, "src", "index.ts"), `import { a } from "./lib/a";\nimport "./setup.js";\n`, "utf8");
    await writeFile(path.join(root, "src", "lib", "a.ts"), `import { b } from "./b";\n`, "utf8");
    await writeFile(path.join(root, "src", "lib", "b.js"), `export const b = 1;\n`, "utf8");
    await writeFile(path.join(root, "src", "setup.js"), `console.log("setup");\n`, "utf8");

    const graph = await buildImportGraph(path.join(root, "src"));
    const metrics = calculateDegreeMetrics(graph);

    assert.deepEqual(graph.nodes, ["index.ts", "lib/a.ts", "lib/b.js", "setup.js"]);
    assert.deepEqual(graph.edges, [
      ["index.ts", "lib/a.ts"],
      ["index.ts", "setup.js"],
      ["lib/a.ts", "lib/b.js"],
    ]);
    assert.equal(metrics.maxInDegree, 1);
    assert.equal(metrics.maxOutDegree, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
