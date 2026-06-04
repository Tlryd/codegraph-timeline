export interface TimelineEntry {
  commit: string;
  commitDate: string;
  nodeCount: number;
  edgeCount: number;
  maxInDegree: number;
  maxOutDegree: number;
  changedFiles: string[];
}

export interface GraphSnapshot {
  nodes: string[];
  edges: Array<[from: string, to: string]>;
}

export interface ScanOptions {
  limit?: number;
  outputPath?: string;
  targetDir?: string;
}
