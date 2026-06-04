import { promises as fs } from "node:fs";
import path from "node:path";
import type { GraphSnapshot } from "./types";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
const IMPORT_RE = /\bimport\s+(?:type\s+)?(?:[^'"`]*?\s+from\s*)?["']([^"']+)["']/g;

export async function buildImportGraph(rootDir: string): Promise<GraphSnapshot> {
  const files = await listSourceFiles(rootDir);
  const fileSet = new Set(files.map((file) => normalizeRelative(rootDir, file)));
  const edges: Array<[string, string]> = [];

  for (const file of files) {
    const from = normalizeRelative(rootDir, file);
    const content = await fs.readFile(file, "utf8");

    for (const specifier of parseImportSpecifiers(content)) {
      if (!specifier.startsWith(".")) {
        continue;
      }

      const resolved = await resolveImport(file, specifier);
      if (!resolved) {
        continue;
      }

      const to = normalizeRelative(rootDir, resolved);
      if (fileSet.has(to)) {
        edges.push([from, to]);
      }
    }
  }

  return {
    nodes: [...fileSet].sort(),
    edges: dedupeEdges(edges).sort(([aFrom, aTo], [bFrom, bTo]) => `${aFrom}\0${aTo}`.localeCompare(`${bFrom}\0${bTo}`)),
  };
}

export function parseImportSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  IMPORT_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = IMPORT_RE.exec(content)) !== null) {
    specifiers.push(match[1]);
  }

  return specifiers;
}

export function calculateDegreeMetrics(graph: GraphSnapshot): Pick<GraphSnapshotMetrics, "maxInDegree" | "maxOutDegree"> {
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const node of graph.nodes) {
    inDegree.set(node, 0);
    outDegree.set(node, 0);
  }

  for (const [from, to] of graph.edges) {
    outDegree.set(from, (outDegree.get(from) ?? 0) + 1);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  }

  return {
    maxInDegree: maxValue(inDegree),
    maxOutDegree: maxValue(outDegree),
  };
}

interface GraphSnapshotMetrics {
  maxInDegree: number;
  maxOutDegree: number;
}

async function listSourceFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }

    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && isSourceFile(entryPath)) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

function isSourceFile(filePath: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(filePath)) && !filePath.endsWith(".d.ts");
}

async function resolveImport(fromFile: string, specifier: string): Promise<string | undefined> {
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    basePath,
    ...RESOLVE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
    ...RESOLVE_EXTENSIONS.map((extension) => path.join(basePath, `index${extension}`)),
  ];

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile() && isSourceFile(candidate)) {
        return candidate;
      }
    } catch {
      // Missing candidates are expected while trying supported extensions.
    }
  }

  return undefined;
}

function normalizeRelative(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function dedupeEdges(edges: Array<[string, string]>): Array<[string, string]> {
  const seen = new Set<string>();
  return edges.filter(([from, to]) => {
    const key = `${from}\0${to}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function maxValue(map: Map<string, number>): number {
  return Math.max(0, ...map.values());
}
