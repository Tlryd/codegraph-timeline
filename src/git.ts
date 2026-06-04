import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function git(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${message}`);
  }
}

export async function getCommits(repoPath: string, limit?: number): Promise<string[]> {
  const output = await git(["rev-list", "--first-parent", "--reverse", "HEAD"], repoPath);
  const commits = output.length === 0 ? [] : output.split(/\r?\n/).filter(Boolean);
  return typeof limit === "number" ? commits.slice(0, limit) : commits;
}

export async function getCommitDate(repoPath: string, commit: string): Promise<string> {
  return git(["show", "-s", "--format=%cI", commit], repoPath);
}

export async function getChangedFiles(repoPath: string, commit: string): Promise<string[]> {
  const output = await git(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commit], repoPath);
  return output.length === 0 ? [] : output.split(/\r?\n/).filter(Boolean);
}

export async function addWorktree(repoPath: string, worktreePath: string, commit: string): Promise<void> {
  await git(["worktree", "add", "--detach", worktreePath, commit], repoPath);
}

export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  await git(["worktree", "remove", "--force", worktreePath], repoPath);
}
