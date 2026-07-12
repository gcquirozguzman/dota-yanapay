const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yanapay", {
  recognizeSpeech: () => ipcRenderer.invoke("recognize-speech"),
  runtimeConfig: () => ipcRenderer.invoke("runtime-config"),
  setWakeListening: (enabled) => ipcRenderer.send("wake-listening", enabled),
  close: () => ipcRenderer.send("close-overlay"),
  minimize: () => ipcRenderer.send("minimize-overlay"),
  onDotaStatus: (callback) => ipcRenderer.on("dota-status", (_event, running) => callback(running)),
  onVoiceHotkey: (callback) => ipcRenderer.on("voice-hotkey", callback),
  onWakeDetected: (callback) => ipcRenderer.on("wake-detected", callback),
  onWakeLoading: (callback) => ipcRenderer.on("wake-loading", (_event, data) => callback(data)),
  onWakeReady: (callback) => ipcRenderer.on("wake-ready", (_event, data) => callback(data)),
  onVoiceQuestion: (callback) => ipcRenderer.on("voice-question", (_event, data) => callback(data)),
  onWakeTimeout: (callback) => ipcRenderer.on("wake-timeout", callback),
  onWakeError: (callback) => ipcRenderer.on("wake-error", (_event, message) => callback(message)),
});
