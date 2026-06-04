import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";

export interface ServeOptions {
  dataDir?: string;
  host?: string;
  port?: number;
}

export interface RunningServer {
  server: Server;
  url: string;
}

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

export async function startServer(options: ServeOptions = {}): Promise<RunningServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4173;
  const projectRoot = path.resolve(__dirname, "..", "..");
  const publicDir = path.join(projectRoot, "public");
  const dataDir = path.resolve(options.dataDir ?? path.join(process.cwd(), "data"));
  const cytoscapePath = path.join(projectRoot, "node_modules", "cytoscape", "dist", "cytoscape.min.js");

  const server = createServer((request, response) => {
    void handleRequest(request, response, { publicDir, dataDir, cytoscapePath });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    server,
    url: `http://${host}:${actualPort}`,
  };
}

interface RequestContext {
  publicDir: string;
  dataDir: string;
  cytoscapePath: string;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, context: RequestContext): Promise<void> {
  try {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname === "/") {
      await sendFile(response, path.join(context.publicDir, "index.html"));
      return;
    }

    if (pathname === "/vendor/cytoscape.min.js") {
      await sendFile(response, context.cytoscapePath);
      return;
    }

    if (pathname === "/data/timeline.json") {
      await sendFile(response, path.join(context.dataDir, "timeline.json"));
      return;
    }

    if (pathname.startsWith("/data/snapshots/")) {
      const snapshotName = path.basename(pathname);
      if (!/^[a-f0-9]+\.json$/iu.test(snapshotName)) {
        sendText(response, 400, "Invalid snapshot name");
        return;
      }

      await sendFile(response, path.join(context.dataDir, "snapshots", snapshotName));
      return;
    }

    if (pathname === "/app.js" || pathname === "/styles.css") {
      await sendFile(response, path.join(context.publicDir, pathname.slice(1)));
      return;
    }

    sendText(response, 404, "Not found");
  } catch (error) {
    const code = isFileNotFound(error) ? 404 : 500;
    sendText(response, code, code === 404 ? "Not found" : "Internal server error");
  }
}

async function sendFile(response: ServerResponse, filePath: string): Promise<void> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    sendText(response, 404, "Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Length": stat.size,
    "Content-Type": MIME_TYPES.get(path.extname(filePath)) ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}

function sendText(response: ServerResponse, statusCode: number, text: string): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(text);
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
