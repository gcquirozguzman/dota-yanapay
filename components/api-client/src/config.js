import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotEnv } from "dotenv";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
loadDotEnv({ path: resolve(currentDirectory, "../../../.env"), quiet: true });

function positiveInteger(value, fallback, name) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} debe ser un entero positivo`);
  }
  return parsed;
}

export function loadApiConfig(env = process.env) {
  const provider = env.AI_PROVIDER ?? "deepseek";
  if (provider !== "deepseek") {
    throw new Error(`AI_PROVIDER no soportado: ${provider}`);
  }

  return {
    provider,
    model: env.AI_MODEL ?? "deepseek-v4-flash",
    apiKey: env.DEEPSEEK_API_KEY ?? "",
    baseUrl: (env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, ""),
    timeoutMs: positiveInteger(env.AI_REQUEST_TIMEOUT_MS, 4000, "AI_REQUEST_TIMEOUT_MS"),
  };
}
