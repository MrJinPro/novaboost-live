import { loadRuntimeEnvFiles } from "./config/load-env-files.js";
import { bootstrapBackend } from "./app.js";

loadRuntimeEnvFiles();

bootstrapBackend();