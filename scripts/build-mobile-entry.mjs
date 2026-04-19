import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, "..");
const frontendScript = path.join(projectRoot, "scripts", "start-frontend.mjs");
const outputFile = path.join(projectRoot, "dist", "client", "index.html");
const port = "4329";

function waitForServer(serverProcess) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      rejectPromise(new Error("Timed out waiting for local frontend server."));
    }, 30000);

    const handleReady = (chunk) => {
      const text = chunk.toString();
      if (text.includes("NovaBoost frontend listening")) {
        clearTimeout(timeout);
        serverProcess.stdout.off("data", handleReady);
        resolvePromise();
      }
    };

    serverProcess.stdout.on("data", handleReady);
    serverProcess.stderr.on("data", (chunk) => {
      clearTimeout(timeout);
      rejectPromise(new Error(chunk.toString()));
    });
    serverProcess.on("exit", (code) => {
      clearTimeout(timeout);
      rejectPromise(new Error(`Frontend server exited early with code ${code ?? "unknown"}.`));
    });
  });
}

const serverProcess = spawn(process.execPath, [frontendScript], {
  cwd: projectRoot,
  env: {
    ...process.env,
    PORT: port,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(serverProcess);
  const response = await fetch(`http://127.0.0.1:${port}/`);

  if (!response.ok) {
    throw new Error(`Failed to fetch app shell: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  await writeFile(outputFile, html, "utf8");
  console.log(`Wrote mobile app entry to ${outputFile}`);
} finally {
  serverProcess.kill();
}