import http from "node:http";
import { Readable } from "node:stream";
import { default as serverEntry } from "../dist/server/server.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";

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
