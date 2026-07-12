import { appendFileSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, "..");
const examplePath = resolve(projectRoot, ".env.example");
const envPath = resolve(projectRoot, ".env");

if (!existsSync(examplePath)) {
  console.warn("Configuracion: no se encontro .env.example; no se creo .env.");
} else if (!existsSync(envPath)) {
  copyFileSync(examplePath, envPath);
  console.log("Configuracion: se creo .env desde .env.example.");
} else {
  const example = readFileSync(examplePath, "utf8");
  const current = readFileSync(envPath, "utf8");
  const existingNames = new Set(
    [...current.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((match) => match[1]),
  );
  const missingLines = example
    .split(/\r?\n/)
    .filter((line) => {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
      return match && !existingNames.has(match[1]);
    });

  if (missingLines.length > 0) {
    appendFileSync(envPath, `\n# Variables agregadas desde .env.example\n${missingLines.join("\n")}\n`);
    console.log(`Configuracion: se agregaron ${missingLines.length} variables nuevas a .env.`);
  } else {
    console.log("Configuracion: .env ya contiene todas las variables requeridas.");
  }
}

const configuredEnv = readFileSync(envPath, "utf8");
let updatedConfiguration = configuredEnv;
if (/^GSI_AUTH_TOKEN=cambia-este-token\s*$/m.test(updatedConfiguration)) {
  const generatedToken = `yanapay-${randomBytes(18).toString("hex")}`;
  updatedConfiguration = updatedConfiguration.replace(
    /^GSI_AUTH_TOKEN=cambia-este-token\s*$/m,
    `GSI_AUTH_TOKEN=${generatedToken}`,
  );
  console.log("Configuracion: se genero un token GSI local seguro.");
}

if (/^WAKE_WORD_CONFIDENCE=(0\.45|0\.55)\s*$/m.test(updatedConfiguration)) {
  updatedConfiguration = updatedConfiguration.replace(
    /^WAKE_WORD_CONFIDENCE=(0\.45|0\.55)\s*$/m,
    "WAKE_WORD_CONFIDENCE=0.25",
  );
  console.log("Configuracion: se aumento la sensibilidad del reconocimiento de voz.");
}

if (updatedConfiguration !== configuredEnv) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(envPath, updatedConfiguration, "utf8");
}
