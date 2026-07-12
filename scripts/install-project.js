import "./setup-env.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptsDirectory, "..");
const envPath = join(projectRoot, ".env");

function readEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

function installPythonDependencies(pythonCommand) {
  const check = spawnSync(pythonCommand, ["-c", "import cv2, mss, numpy, faster_whisper, sounddevice"], {
    stdio: "ignore",
    windowsHide: true,
  });
  if (check.status === 0) {
    console.log("Python: dependencias de vision y voz ya estan instaladas.");
    return;
  }

  console.log("Python: instalando dependencias de vision y voz...");
  const visionInstall = spawnSync(pythonCommand, [
    "-m", "pip", "install", "-r", join(projectRoot, "components/vision/requirements.txt"),
  ], { stdio: "inherit", windowsHide: true });
  const voiceInstall = spawnSync(pythonCommand, [
    "-m", "pip", "install", "-r", join(projectRoot, "components/voice/requirements.txt"),
  ], { stdio: "inherit", windowsHide: true });
  if (visionInstall.status !== 0 || voiceInstall.status !== 0) {
    console.warn("Python: no se pudieron instalar todas las dependencias. Ejecuta npm run setup nuevamente.");
  }
}

function steamRoots() {
  const roots = new Set(["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam"]);
  const registry = spawnSync("reg.exe", [
    "query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath",
  ], { encoding: "utf8", windowsHide: true });
  const registryMatch = registry.stdout?.match(/SteamPath\s+REG_SZ\s+(.+)$/m);
  if (registryMatch) roots.add(registryMatch[1].trim());

  for (const root of [...roots]) {
    const librariesPath = join(root, "steamapps", "libraryfolders.vdf");
    if (!existsSync(librariesPath)) continue;
    const libraries = readFileSync(librariesPath, "utf8");
    for (const match of libraries.matchAll(/"path"\s+"([^"]+)"/g)) {
      roots.add(match[1].replace(/\\\\/g, "\\"));
    }
  }
  return [...roots];
}

function findDotaGamePath(configuredPath) {
  const candidates = [];
  if (configuredPath) candidates.push(configuredPath, join(configuredPath, "game", "dota"));
  for (const root of steamRoots()) {
    candidates.push(join(root, "steamapps", "common", "dota 2 beta", "game", "dota"));
  }
  return candidates.find((candidate) => existsSync(join(candidate, "cfg"))) ?? null;
}

function configureDota(env) {
  const gamePath = findDotaGamePath(env.DOTA2_PATH);
  if (!gamePath) {
    console.warn("Dota GSI: no se encontro Dota 2. Define DOTA2_PATH en .env y ejecuta npm run setup.");
    return;
  }

  const token = env.GSI_AUTH_TOKEN;
  if (!token || token === "cambia-este-token" || /["\r\n]/.test(token)) {
    console.warn("Dota GSI: GSI_AUTH_TOKEN no es valido; no se copio la configuracion.");
    return;
  }

  const host = env.GSI_HOST || "127.0.0.1";
  const port = env.GSI_PORT || "3000";
  const templatePath = join(projectRoot, "config", "gamestate_integration_dota_yanapay.cfg");
  const configured = readFileSync(templatePath, "utf8")
    .replace(/"uri"\s+"[^"]+"/, `"uri"               "http://${host}:${port}/gsi"`)
    .replace(/"token"\s+"[^"]+"/, `"token"           "${token}"`);
  const destination = join(gamePath, "cfg", "gamestate_integration");
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, "gamestate_integration_dota_yanapay.cfg"), configured, "utf8");
  console.log(`Dota GSI: configuracion instalada en ${destination}`);
}

const env = { ...readEnvFile(envPath), ...process.env };
installPythonDependencies(env.PYTHON_COMMAND || "python");
configureDota(env);
console.log("Instalacion de Yanapay terminada. Configura DEEPSEEK_API_KEY y ejecuta npm run app.");
