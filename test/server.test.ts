import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../src/server";

test("startServer serves timeline and snapshot JSON", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codegraph-timeline-server-test-"));

  try {
    await mkdir(path.join(root, "snapshots"), { recursive: true });
    await writeFile(path.join(root, "timeline.json"), JSON.stringify([{ commit: "abc123" }]), "utf8");
    await writeFile(path.join(root, "snapshots", "abc123.json"), JSON.stringify({ commit: "abc123" }), "utf8");

    const runningServer = await startServer({ dataDir: root, port: 0 });

    try {
      const timelineResponse = await fetch(`${runningServer.url}/data/timeline.json`);
      const snapshotResponse = await fetch(`${runningServer.url}/data/snapshots/abc123.json`);
      const appResponse = await fetch(`${runningServer.url}/`);

      assert.equal(timelineResponse.status, 200);
      assert.deepEqual(await timelineResponse.json(), [{ commit: "abc123" }]);
      assert.equal(snapshotResponse.status, 200);
      assert.deepEqual(await snapshotResponse.json(), { commit: "abc123" });
      assert.equal(appResponse.status, 200);
      assert.match(await appResponse.text(), /codegraph-timeline/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        runningServer.server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
