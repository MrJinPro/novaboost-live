import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { default as serverEntry } from "../dist/server/server.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, "..");
const clientRoot = path.join(projectRoot, "dist", "client");
const publicRoot = path.join(projectRoot, "public");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function getStaticContentType(filePath) {
  return contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

function isInsideDirectory(candidatePath, rootPath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function resolveStaticFile(requestPathname) {
  const normalizedPath = requestPathname === "/" ? "/index.html" : requestPathname;
  const clientCandidate = path.normalize(path.join(clientRoot, normalizedPath));

  if (isInsideDirectory(clientCandidate, clientRoot) && fs.existsSync(clientCandidate) && fs.statSync(clientCandidate).isFile()) {
    return clientCandidate;
  }

  const publicCandidate = path.normalize(path.join(publicRoot, normalizedPath));

  if (isInsideDirectory(publicCandidate, publicRoot) && fs.existsSync(publicCandidate) && fs.statSync(publicCandidate).isFile()) {
    return publicCandidate;
  }

  return null;
}

function writeStaticResponse(nodeResponse, filePath) {
  nodeResponse.statusCode = 200;
  nodeResponse.setHeader("content-type", getStaticContentType(filePath));
  fs.createReadStream(filePath).pipe(nodeResponse);
}

function toWebHeaders(headers) {
  const webHeaders = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        webHeaders.append(key, item);
      }
      continue;
    }

    webHeaders.set(key, value);
  }

  return webHeaders;
}

function createRequest(req) {
  const origin = `http://${req.headers.host ?? `${host}:${port}`}`;
  const url = new URL(req.url ?? "/", origin);
  const method = req.method ?? "GET";
  const headers = toWebHeaders(req.headers);
  const isBodyAllowed = method !== "GET" && method !== "HEAD";

  return new Request(url, {
    method,
    headers,
    body: isBodyAllowed ? Readable.toWeb(req) : undefined,
    duplex: isBodyAllowed ? "half" : undefined,
  });
}

async function writeResponse(nodeResponse, webResponse) {
  nodeResponse.statusCode = webResponse.status;
  nodeResponse.statusMessage = webResponse.statusText;

  webResponse.headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value);
  });

  if (!webResponse.body) {
    nodeResponse.end();
    return;
  }

  Readable.fromWeb(webResponse.body).pipe(nodeResponse);
}

const httpServer = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);
    const staticFile = resolveStaticFile(requestUrl.pathname);

    if (staticFile) {
      writeStaticResponse(res, staticFile);
      return;
    }

    const request = createRequest(req);
    const response = await serverEntry.fetch(request);
    await writeResponse(res, response);
  } catch (error) {
    console.error("Frontend server request failed", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Internal Server Error");
  }
});

httpServer.listen(port, host, () => {
  console.log(`NovaBoost frontend listening on http://${host}:${port}`);
});
