import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import Busboy from "busboy";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { BackendEnv } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const IMAGE_EXTENSIONS_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

type MediaKind = "viewer-avatar" | "streamer-avatar" | "streamer-banner";

type UploadedMedia = {
  kind: MediaKind;
  relativePath: string;
  url: string;
  bytes: number;
};

function getMediaRoot(env: BackendEnv) {
  return resolve(env.MEDIA_UPLOAD_DIR || resolve(process.cwd(), "backend", "uploads"));
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function isInsideRoot(candidatePath: string, rootPath: string) {
  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}${sep}`);
}

function getMediaSubdirectory(userId: string, kind: MediaKind) {
  const safeUserId = sanitizeSegment(userId);

  switch (kind) {
    case "viewer-avatar":
      return resolve("users", safeUserId, "profile", "avatar");
    case "streamer-avatar":
      return resolve("users", safeUserId, "streamer", "avatar");
    case "streamer-banner":
      return resolve("users", safeUserId, "streamer", "banner");
  }
}

function getRequestOrigin(request: IncomingMessage, env: BackendEnv) {
  if (env.MEDIA_PUBLIC_BASE_URL) {
    return env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, "");
  }

  const protocolHeader = request.headers["x-forwarded-proto"];
  const forwardedProtocol = Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader;
  const hostHeader = request.headers["x-forwarded-host"] ?? request.headers.host ?? `127.0.0.1:${env.BACKEND_PORT}`;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const protocol = forwardedProtocol || (env.NODE_ENV === "production" ? "https" : "http");
  return `${protocol}://${host}`;
}

function buildPublicUrl(request: IncomingMessage, env: BackendEnv, relativePath: string) {
  const normalizedPath = relativePath.split(sep).join("/");
  return `${getRequestOrigin(request, env)}/media/${normalizedPath}`;
}

async function ensureMediaDirectories(env: BackendEnv) {
  const mediaRoot = getMediaRoot(env);
  await Promise.all([
    mkdir(resolve(mediaRoot, "users"), { recursive: true }),
    mkdir(resolve(mediaRoot, "common"), { recursive: true }),
  ]);
  return mediaRoot;
}

async function readUploadedFile(request: IncomingMessage): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  const contentType = request.headers["content-type"];

  if (!contentType || !contentType.toLowerCase().includes("multipart/form-data")) {
    throw new Error("Ожидался multipart/form-data запрос с файлом.");
  }

  return await new Promise((resolvePromise, rejectPromise) => {
    const busboy = Busboy({ headers: request.headers, limits: { files: 1, fileSize: MAX_UPLOAD_BYTES } });
    let completed = false;
    let fileFound = false;

    busboy.on("file", (_fieldName, file, info) => {
      if (completed) {
        file.resume();
        return;
      }

      fileFound = true;
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      file.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_UPLOAD_BYTES) {
          completed = true;
          rejectPromise(new Error("Файл слишком большой. Максимум 8 MB."));
          file.resume();
          return;
        }

        chunks.push(Buffer.from(chunk));
      });

      file.on("limit", () => {
        if (!completed) {
          completed = true;
          rejectPromise(new Error("Файл слишком большой. Максимум 8 MB."));
        }
      });

      file.on("end", () => {
        if (completed) {
          return;
        }

        completed = true;
        resolvePromise({
          buffer: Buffer.concat(chunks),
          mimeType: info.mimeType,
          filename: info.filename,
        });
      });
    });

    busboy.on("finish", () => {
      if (!completed && !fileFound) {
        completed = true;
        rejectPromise(new Error("Файл не был передан."));
      }
    });

    busboy.on("error", (error) => {
      if (!completed) {
        completed = true;
        rejectPromise(error);
      }
    });

    request.pipe(busboy);
  });
}

async function authenticateRequest(request: IncomingMessage, supabaseAdmin: SupabaseClient | null) {
  if (!supabaseAdmin) {
    throw new Error("Backend upload требует SUPABASE service-role credentials.");
  }

  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) {
    throw error;
  }

  return data.user ?? null;
}

function parseKind(url: URL): MediaKind {
  const requestedKind = url.searchParams.get("kind");
  if (requestedKind === "viewer-avatar" || requestedKind === "streamer-avatar" || requestedKind === "streamer-banner") {
    return requestedKind;
  }

  throw new Error("Неизвестный тип медиа. Используй viewer-avatar, streamer-avatar или streamer-banner.");
}

function resolveExtension(mimeType: string, originalFilename: string) {
  const byMime = IMAGE_EXTENSIONS_BY_MIME[mimeType.toLowerCase()];
  if (byMime) {
    return byMime;
  }

  const byFilename = extname(originalFilename).toLowerCase();
  if (CONTENT_TYPES_BY_EXTENSION[byFilename]) {
    return byFilename;
  }

  throw new Error("Разрешены только JPG, PNG, WEBP и GIF изображения.");
}

function writeJson(response: ServerResponse<IncomingMessage>, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  });
  response.end(JSON.stringify(body));
}

export async function handleMediaUploadRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  url: URL,
  env: BackendEnv,
  logger: Logger,
  supabaseAdmin: SupabaseClient | null,
) {
  try {
    const currentUser = await authenticateRequest(request, supabaseAdmin);
    if (!currentUser) {
      writeJson(response, 401, { error: "Нужна авторизация для загрузки файла." });
      return;
    }

    const kind = parseKind(url);
    const upload = await readUploadedFile(request);
    const extension = resolveExtension(upload.mimeType, upload.filename);
    const mediaRoot = await ensureMediaDirectories(env);
    const mediaDirectory = resolve(mediaRoot, getMediaSubdirectory(currentUser.id, kind));

    if (!isInsideRoot(mediaDirectory, mediaRoot)) {
      throw new Error("Некорректная директория для загрузки файла.");
    }

    await mkdir(mediaDirectory, { recursive: true });

    const filename = `${Date.now()}-${randomUUID()}${extension}`;
    const absolutePath = resolve(mediaDirectory, filename);
    const relativePath = absolutePath.slice(mediaRoot.length + 1);

    await writeFile(absolutePath, upload.buffer);

    const payload: UploadedMedia = {
      kind,
      relativePath: relativePath.split(sep).join("/"),
      url: buildPublicUrl(request, env, relativePath),
      bytes: upload.buffer.byteLength,
    };

    writeJson(response, 200, payload);
  } catch (error) {
    logger.error("Failed to upload media", {
      error: error instanceof Error ? error.message : String(error),
      path: request.url,
    });
    writeJson(response, 400, {
      error: error instanceof Error ? error.message : "Не удалось загрузить файл.",
    });
  }
}

export async function tryServeMediaRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  env: BackendEnv,
) {
  if (!request.url) {
    return false;
  }

  const url = new URL(request.url, `http://127.0.0.1:${env.BACKEND_PORT}`);
  if (request.method !== "GET" || !url.pathname.startsWith("/media/")) {
    return false;
  }

  const mediaRoot = await ensureMediaDirectories(env);
  const requestedPath = decodeURIComponent(url.pathname.replace(/^\/media\//, ""));
  const absolutePath = resolve(mediaRoot, requestedPath);

  if (!isInsideRoot(absolutePath, mediaRoot)) {
    response.writeHead(403).end("Forbidden");
    return true;
  }

  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      response.writeHead(404).end("Not found");
      return true;
    }

    response.writeHead(200, {
      "content-type": CONTENT_TYPES_BY_EXTENSION[extname(basename(absolutePath)).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "access-control-allow-origin": "*",
    });
    createReadStream(absolutePath).pipe(response);
    return true;
  } catch {
    response.writeHead(404).end("Not found");
    return true;
  }
}

export async function getAuthenticatedUserForDebug(
  request: IncomingMessage,
  supabaseAdmin: SupabaseClient | null,
): Promise<User | null> {
  return authenticateRequest(request, supabaseAdmin);
}