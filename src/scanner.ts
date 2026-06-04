import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { addWorktree, getChangedFiles, getCommitDate, getCommits, git, removeWorktree } from "./git";
import { buildImportGraph, calculateDegreeMetrics } from "./importGraph";
import type { ScanOptions, TimelineEntry } from "./types";

export async function scanRepository(repoPath: string, options: ScanOptions = {}): Promise<TimelineEntry[]> {
  const resolvedRepoPath = path.resolve(repoPath);
  await assertGitRepository(resolvedRepoPath);

  const commits = await getCommits(resolvedRepoPath, options.limit);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codegraph-timeline-"));
  const timeline: TimelineEntry[] = [];

  try {
    for (const commit of commits) {
      const worktreePath = path.join(tempRoot, commit);
      let added = false;

      try {
        await addWorktree(resolvedRepoPath, worktreePath, commit);
        added = true;

        const analysisRoot = path.resolve(worktreePath, options.targetDir ?? ".");
        const graph = await buildImportGraph(analysisRoot);
        const degreeMetrics = calculateDegreeMetrics(graph);

        timeline.push({
          commit,
          commitDate: await getCommitDate(resolvedRepoPath, commit),
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
          maxInDegree: degreeMetrics.maxInDegree,
          maxOutDegree: degreeMetrics.maxOutDegree,
          changedFiles: await getChangedFiles(resolvedRepoPath, commit),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to scan commit ${commit}: ${message}`);
      } finally {
        if (added) {
          await removeWorktree(resolvedRepoPath, worktreePath).catch(async () => {
            await fs.rm(worktreePath, { recursive: true, force: true });
          });
        }
      }
    }

    await writeTimeline(options.outputPath ?? path.join(process.cwd(), "data", "timeline.json"), timeline);
    return timeline;
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function assertGitRepository(repoPath: string): Promise<void> {
  try {
    const stat = await fs.stat(repoPath);
    if (!stat.isDirectory()) {
      throw new Error("path is not a directory");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Repository path is invalid: ${repoPath}: ${message}`);
  }

  await git(["rev-parse", "--is-inside-work-tree"], repoPath);
}

async function writeTimeline(outputPath: string, timeline: TimelineEntry[]): Promise<void> {
  const resolvedOutputPath = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await fs.writeFile(resolvedOutputPath, `${JSON.stringify(timeline, null, 2)}\n`, "utf8");
}
