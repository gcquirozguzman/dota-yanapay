import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotEnv } from "dotenv";
import { AdviceCoordinator, DeepSeekClient, loadApiConfig } from "@dota-yanapay/api-client";
import { createGsiServer } from "./app.js";
import { loadConfig } from "./config.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
loadDotEnv({ path: resolve(currentDirectory, "../../../.env"), quiet: true });

const config = loadConfig();
let adviceCoordinator = null;

try {
  const apiConfig = loadApiConfig();
  adviceCoordinator = new AdviceCoordinator(new DeepSeekClient(apiConfig), {
    minIntervalMs: Number.parseInt(process.env.AI_MIN_INTERVAL_MS ?? "5000", 10),
  });
  console.log(`Coach IA habilitado con ${apiConfig.model}.`);
} catch (error) {
  console.warn(`Coach IA deshabilitado: ${error.message}`);
}

const { server } = createGsiServer(config, { adviceCoordinator });

server.listen(config.port, config.host, () => {
  const address = server.address();
  console.log(`Dota Yanapay GSI escuchando en http://${config.host}:${address.port}`);
  if (config.authToken === "cambia-este-token") {
    console.warn("AVISO: configura GSI_AUTH_TOKEN antes de usar el servidor.");
  }
});

const shutdown = (signal) => {
  console.log(`Cerrando servidor (${signal})...`);
  server.close(() => process.exit(0));
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
