import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";
import { scanRepository } from "../src/scanner";

const execFileAsync = promisify(execFile);

test("scanRepository writes timeline snapshots from git worktrees", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codegraph-timeline-scan-test-"));
  const repo = path.join(root, "repo");
  const outputPath = path.join(root, "timeline.json");

  try {
    await mkdir(path.join(repo, "src"), { recursive: true });
    await git(["init"], repo);
    await git(["config", "user.email", "test@example.com"], repo);
    await git(["config", "user.name", "Test User"], repo);

    await writeFile(path.join(repo, "src", "a.ts"), "export const a = 1;\n", "utf8");
    await writeFile(path.join(repo, "src", "index.ts"), "import { a } from './a';\n", "utf8");
    await git(["add", "."], repo);
    await git(["commit", "-m", "initial"], repo);

    await writeFile(path.join(repo, "src", "b.ts"), "import { a } from './a';\nexport const b = a;\n", "utf8");
    await writeFile(path.join(repo, "src", "index.ts"), "import { a } from './a';\nimport { b } from './b';\n", "utf8");
    await git(["add", "."], repo);
    await git(["commit", "-m", "add b"], repo);

    const timeline = await scanRepository(repo, { outputPath, targetDir: "src", limit: 2 });
    const written = JSON.parse(await readFile(outputPath, "utf8"));

    assert.equal(timeline.length, 2);
    assert.deepEqual(written, timeline);
    assert.equal(timeline[0].nodeCount, 2);
    assert.equal(timeline[0].edgeCount, 1);
    assert.equal(timeline[1].nodeCount, 3);
    assert.equal(timeline[1].edgeCount, 3);
    assert.equal(timeline[1].maxInDegree, 2);
    assert.match(timeline[0].commitDate, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(timeline[1].changedFiles.includes("src/b.ts"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd, windowsHide: true });
}
