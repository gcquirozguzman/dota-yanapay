import { execFile, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotEnv } from "dotenv";
import { app, BrowserWindow, globalShortcut, ipcMain, screen } from "electron";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, "../../..");
loadDotEnv({ path: resolve(projectRoot, ".env"), quiet: true });
const localServerUrl = `http://${process.env.GSI_HOST ?? "127.0.0.1"}:${process.env.GSI_PORT ?? "3000"}`;
const backendEntry = resolve(projectRoot, "components/gsi-server/src/server.js");
const visionEntry = resolve(projectRoot, "components/vision/src/minimap_vision.py");
const whisperListener = resolve(projectRoot, "components/voice/src/voice_listener.py");
const speechScript = resolve(currentDirectory, "../scripts/recognize-speech.ps1");
const wakeScript = resolve(currentDirectory, "../scripts/wake-word-listener.ps1");

let window;
let backendProcess;
let visionProcess;
let dotaTimer;
let wakeProcess;
let wakeRestartTimer;
let quitting = false;
let wakeListeningEnabled = (process.env.WAKE_WORD_ENABLED ?? "true") === "true";

function pipeProcess(child, label) {
  child.stdout?.on("data", (data) => process.stdout.write(`[${label}] ${data}`));
  child.stderr?.on("data", (data) => process.stderr.write(`[${label}] ${data}`));
  child.on("error", (error) => console.error(`${label} no pudo iniciar: ${error.message}`));
}

async function backendIsRunning() {
  try {
    const response = await fetch(`${localServerUrl}/health`, {
      signal: AbortSignal.timeout(500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function startServices() {
  if (!(await backendIsRunning())) {
    backendProcess = spawn(process.execPath, [backendEntry], {
      cwd: projectRoot,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      windowsHide: true,
    });
    pipeProcess(backendProcess, "servidor");
  }

  if ((process.env.VISION_ENABLED ?? "true") === "true") {
    visionProcess = spawn(process.env.PYTHON_COMMAND ?? "python", [visionEntry], {
      cwd: projectRoot,
      env: process.env,
      windowsHide: true,
    });
    pipeProcess(visionProcess, "vision");
  }
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  window = new BrowserWindow({
    width: 410,
    height: 210,
    x: area.x + area.width - 430,
    y: area.y + area.height - 230,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: false,
    webPreferences: {
      preload: resolve(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.setAlwaysOnTop(true, "screen-saver");
  window.loadFile(resolve(currentDirectory, "index.html"));
}

function recognizeSpeech() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", speechScript,
      "-Locale", process.env.VOICE_LOCALE ?? "es-ES",
      "-TimeoutSeconds", process.env.VOICE_LISTEN_SECONDS ?? "8",
    ], { windowsHide: true });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        const lines = stdout.trim().split(/\r?\n/);
        const result = JSON.parse(lines.at(-1));
        if (!result.text) throw new Error(result.error ?? "No se detecto voz");
        resolvePromise(result);
      } catch (error) {
        reject(new Error(stderr.trim() || error.message || `Reconocimiento termino con codigo ${code}`));
      }
    });
  });
}

function stopWakeListener() {
  clearTimeout(wakeRestartTimer);
  wakeRestartTimer = null;
  if (wakeProcess) {
    wakeProcess.kill();
    wakeProcess = null;
  }
}

function startWakeListener() {
  if (quitting || wakeProcess || !wakeListeningEnabled) return;
  const useWhisper = (process.env.VOICE_ENGINE ?? "faster-whisper") === "faster-whisper";
  const command = useWhisper ? (process.env.PYTHON_COMMAND ?? "python") : "powershell.exe";
  const args = useWhisper
    ? [whisperListener, "--model", process.env.WHISPER_MODEL ?? "small", "--wake-word", process.env.WAKE_WORD ?? "yanapay"]
    : [
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", wakeScript,
        "-Locale", process.env.VOICE_LOCALE ?? "es-ES",
        "-WakeWord", process.env.WAKE_WORD ?? "yanapay",
        "-QuestionTimeoutSeconds", process.env.WAKE_WORD_TIMEOUT_SECONDS ?? "10",
        "-MinimumConfidence", process.env.WAKE_WORD_CONFIDENCE ?? "0.25",
      ];
  const child = spawn(command, args, { windowsHide: true, env: process.env });
  wakeProcess = child;
  let buffer = "";

  child.stdout.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "ready") window?.webContents.send("wake-ready", event);
        if (event.type === "loading") window?.webContents.send("wake-loading", event);
        if (event.type === "wake") window?.webContents.send("wake-detected", event);
        if (event.type === "question") {
          wakeListeningEnabled = false;
          window?.webContents.send("voice-question", event);
          setTimeout(stopWakeListener, 0);
        }
        if (event.type === "timeout") window?.webContents.send("wake-timeout");
        if (event.type === "error") window?.webContents.send("wake-error", event.message);
      } catch {
        console.warn(`Listener de voz: salida no reconocida: ${line}`);
      }
    }
  });
  child.stderr.on("data", (data) => console.error(`[voz] ${data}`));
  child.on("error", (error) => window?.webContents.send("wake-error", error.message));
  child.on("close", () => {
    if (wakeProcess === child) wakeProcess = null;
    if (!quitting && wakeListeningEnabled) {
      wakeRestartTimer = setTimeout(startWakeListener, 1500);
    }
  });
}

async function recognizeWithWakePause() {
  wakeListeningEnabled = false;
  stopWakeListener();
  try {
    return await recognizeSpeech();
  } finally {
    wakeListeningEnabled = true;
    startWakeListener();
  }
}

function monitorDota() {
  let previous = null;
  const check = () => {
    execFile("powershell.exe", [
      "-NoProfile",
      "-Command",
      "if (Get-Process -Name dota2 -ErrorAction SilentlyContinue) { 'true' } else { 'false' }",
    ], { windowsHide: true }, (_error, stdout) => {
      const running = stdout.trim() === "true";
      if (running !== previous) {
        previous = running;
        window?.webContents.send("dota-status", running);
      }
    });
  };
  check();
  dotaTimer = setInterval(check, 3000);
}

app.whenReady().then(async () => {
  await startServices();
  createWindow();
  monitorDota();
  window.webContents.once("did-finish-load", startWakeListener);

  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    window?.webContents.send("voice-hotkey");
  });
});

ipcMain.handle("recognize-speech", recognizeWithWakePause);
ipcMain.on("wake-listening", (_event, enabled) => {
  wakeListeningEnabled = Boolean(enabled);
  if (wakeListeningEnabled) startWakeListener();
  else stopWakeListener();
});
ipcMain.on("close-overlay", () => app.quit());
ipcMain.on("minimize-overlay", () => window?.minimize());
ipcMain.handle("runtime-config", () => ({
  serverUrl: localServerUrl,
  voiceEnabled: (process.env.VOICE_ENABLED ?? "true") === "true",
  voiceLocale: process.env.VOICE_LOCALE ?? "es-ES",
  wakeWordEnabled: (process.env.WAKE_WORD_ENABLED ?? "true") === "true",
  wakeWord: process.env.WAKE_WORD ?? "yanapay",
}));

app.on("will-quit", () => {
  quitting = true;
  stopWakeListener();
  globalShortcut.unregisterAll();
  clearInterval(dotaTimer);
  backendProcess?.kill();
  visionProcess?.kill();
});

app.on("window-all-closed", () => app.quit());
