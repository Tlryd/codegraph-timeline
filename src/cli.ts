#!/usr/bin/env node
import path from "node:path";
import { scanRepository } from "./scanner";
import { startServer } from "./server";

interface ParsedArgs {
  command?: string;
  repoPath?: string;
  limit?: number;
  outputPath?: string;
  targetDir?: string;
  dataDir?: string;
  host?: string;
  port?: number;
  help: boolean;
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));

    if (args.help || !args.command) {
      printUsage();
      process.exit(args.help ? 0 : 1);
    }

    if (args.command === "serve") {
      const runningServer = await startServer({
        dataDir: args.dataDir,
        host: args.host,
        port: args.port,
      });
      console.log(`codegraph-timeline UI: ${runningServer.url}`);
      return;
    }

    if (args.command !== "scan" || !args.repoPath) {
      printUsage();
      process.exit(1);
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

    if (arg === "--data-dir") {
      parsed.dataDir = requireValue(argv[++index], "--data-dir");
      continue;
    }

    if (arg.startsWith("--data-dir=")) {
      parsed.dataDir = requireValue(arg.slice("--data-dir=".length), "--data-dir");
      continue;
    }

    if (arg === "--host") {
      parsed.host = requireValue(argv[++index], "--host");
      continue;
    }

    if (arg.startsWith("--host=")) {
      parsed.host = requireValue(arg.slice("--host=".length), "--host");
      continue;
    }

    if (arg === "--port") {
      parsed.port = parsePositiveInteger(argv[++index], "--port");
      continue;
    }

    if (arg.startsWith("--port=")) {
      parsed.port = parsePositiveInteger(arg.slice("--port=".length), "--port");
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
  if (parsed.command === "scan") {
    parsed.repoPath = positional[1];
  }

  const expectedPositionals = parsed.command === "scan" ? 2 : 1;
  if (positional.length > expectedPositionals) {
    throw new Error(`Unexpected argument: ${positional[expectedPositionals]}`);
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
  codegraph-timeline serve [--data-dir <dir>] [--host <host>] [--port <port>]

Options:
  --limit <count>     Limit the number of commits scanned from the oldest first-parent commits.
  --target-dir <dir>  Directory inside each worktree to analyze. Defaults to repository root.
  --output <path>     Output JSON path. Defaults to data/timeline.json in the current directory.
  --data-dir <dir>    Directory containing timeline.json and snapshots/. Defaults to data in the current directory.
  --host <host>       Host for serve. Defaults to 127.0.0.1.
  --port <port>       Port for serve. Defaults to 4173.
  -h, --help          Show this help.
`);
}

if (require.main === module) {
  void main();
}
