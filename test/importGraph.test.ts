import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { buildImportGraph, calculateDegreeMetrics, parseImportSpecifiers, parsePythonImportSpecifiers } from "../src/importGraph";

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

test("parsePythonImportSpecifiers finds import and from import modules", () => {
  const specifiers = parsePythonImportSpecifiers(`
    import os
    import helper as h, package.tools
    from services import api
    from . import local_helper
    from .package import module as renamed
  `);

  assert.deepEqual(specifiers, [
    "os",
    "helper",
    "package.tools",
    "services",
    "services.api",
    ".local_helper",
    ".package",
    ".package.module",
  ]);
});

test("buildImportGraph creates edges for resolved Python imports", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codegraph-timeline-python-test-"));

  try {
    await mkdir(path.join(root, "app", "package"), { recursive: true });
    await writeFile(path.join(root, "app", "main.py"), `import helper\nfrom package import tools\n`, "utf8");
    await writeFile(path.join(root, "app", "helper.py"), `from .package import tools\n`, "utf8");
    await writeFile(path.join(root, "app", "package", "__init__.py"), "", "utf8");
    await writeFile(path.join(root, "app", "package", "tools.py"), `VALUE = 1\n`, "utf8");

    const graph = await buildImportGraph(path.join(root, "app"));
    const metrics = calculateDegreeMetrics(graph);

    assert.deepEqual(graph.nodes, ["helper.py", "main.py", "package/__init__.py", "package/tools.py"]);
    assert.deepEqual(graph.edges, [
      ["helper.py", "package/__init__.py"],
      ["helper.py", "package/tools.py"],
      ["main.py", "helper.py"],
      ["main.py", "package/__init__.py"],
      ["main.py", "package/tools.py"],
    ]);
    assert.equal(metrics.maxInDegree, 2);
    assert.equal(metrics.maxOutDegree, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
