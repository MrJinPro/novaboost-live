import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function applyEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

export function loadRuntimeEnvFiles() {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const backendRoot = path.resolve(currentDirectory, "..", "..");
  const projectRoot = path.resolve(backendRoot, "..");

  applyEnvFile(path.join(projectRoot, ".env"));
  applyEnvFile(path.join(backendRoot, ".env"));
}