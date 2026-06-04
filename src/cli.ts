#!/usr/bin/env node
import path from "node:path";
import { scanRepository } from "./scanner";

interface ParsedArgs {
  command?: string;
  repoPath?: string;
  limit?: number;
  outputPath?: string;
  targetDir?: string;
  help: boolean;
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));

    if (args.help || args.command !== "scan" || !args.repoPath) {
      printUsage();
      process.exit(args.help ? 0 : 1);
    }

    const outputPath = args.outputPath ? path.resolve(args.outputPath) : path.join(process.cwd(), "data", "timeline.json");
    const timeline = await scanRepository(args.repoPath, {
      limit: args.limit,
      outputPath,
      targetDir: args.targetDir,
    });

    console.log(`Wrote ${timeline.length} snapshots to ${outputPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`codegraph-timeline: ${message}`);
    process.exit(1);
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { help: false };
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
      continue;
    }

    if (arg === "--limit") {
      const rawValue = argv[++index];
      parsed.limit = parsePositiveInteger(rawValue, "--limit");
      continue;
    }

    if (arg.startsWith("--limit=")) {
      parsed.limit = parsePositiveInteger(arg.slice("--limit=".length), "--limit");
      continue;
    }

    if (arg === "--output") {
      parsed.outputPath = requireValue(argv[++index], "--output");
      continue;
    }

    if (arg.startsWith("--output=")) {
      parsed.outputPath = requireValue(arg.slice("--output=".length), "--output");
      continue;
    }

    if (arg === "--target-dir") {
      parsed.targetDir = requireValue(argv[++index], "--target-dir");
      continue;
    }

    if (arg.startsWith("--target-dir=")) {
      parsed.targetDir = requireValue(arg.slice("--target-dir=".length), "--target-dir");
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positional.push(arg);
  }

  parsed.command = positional[0];
  parsed.repoPath = positional[1];

  if (positional.length > 2) {
    throw new Error(`Unexpected argument: ${positional[2]}`);
  }

  return parsed;
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  const requiredValue = requireValue(value, flag);
  const parsed = Number(requiredValue);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }

  return parsed;
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

function printUsage(): void {
  console.log(`Usage:
  codegraph-timeline scan <repoPath> [--limit <count>] [--target-dir <dir>] [--output <path>]

Options:
  --limit <count>     Limit the number of commits scanned from the oldest first-parent commits.
  --target-dir <dir>  Directory inside each worktree to analyze. Defaults to repository root.
  --output <path>     Output JSON path. Defaults to data/timeline.json in the current directory.
  -h, --help          Show this help.
`);
}

if (require.main === module) {
  void main();
}
