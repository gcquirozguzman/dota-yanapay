const statusElement = document.querySelector("#status");
const adviceElement = document.querySelector("#advice");

let config;
let listening = false;
let lastAdviceText = null;
let lastAdviceAt = 0;

function setStatus(text) {
  statusElement.textContent = text;
}

function speak(text) {
  if (!config.voiceEnabled || !window.speechSynthesis) {
    window.yanapay.setWakeListening(true);
    return;
  }
  window.yanapay.setWakeListening(false);
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = config.voiceLocale;
  const voices = window.speechSynthesis.getVoices();
  utterance.voice = voices.find((voice) => voice.lang.startsWith("es")) ?? null;
  utterance.rate = 1.08;
  utterance.onend = () => window.yanapay.setWakeListening(true);
  utterance.onerror = () => window.yanapay.setWakeListening(true);
  window.speechSynthesis.speak(utterance);
}

function showAdvice(advice) {
  const now = Date.now();
  if (advice.advice === lastAdviceText && now - lastAdviceAt < 60000) return;
  lastAdviceText = advice.advice;
  lastAdviceAt = now;
  adviceElement.textContent = advice.advice;
  setStatus(advice.source === "voice" ? "Respuesta a tu pregunta" : `Consejo ${advice.priority}`);
  speak(advice.advice);
}

function connectEvents() {
  const events = new EventSource(`${config.serverUrl}/events`);
  events.addEventListener("status", (event) => {
    const data = JSON.parse(event.data);
    if (data.aiEnabled === false) setStatus("Configura DeepSeek en .env");
    else setStatus("Conectado · esperando Dota 2");
  });
  events.addEventListener("advice", (event) => showAdvice(JSON.parse(event.data)));
  events.addEventListener("error", (event) => {
    if (event.data) {
      const data = JSON.parse(event.data);
      setStatus(`Error: ${data.message}`);
    } else {
      setStatus("Reconectando con el servidor…");
    }
  });
}

async function listenAndAsk() {
  if (listening) return;
  listening = true;
  setStatus("Habla ahora");

  try {
    const recognition = await window.yanapay.recognizeSpeech();
    await askQuestion(recognition.text);
  } catch (error) {
    setStatus("No pude escuchar o responder");
    adviceElement.textContent = error.message;
  } finally {
    listening = false;
  }
}

async function askQuestion(question) {
  window.yanapay.setWakeListening(false);
  adviceElement.textContent = `“${question}”`;
  setStatus("Analizando tu pregunta…");
  try {
    const response = await fetch(`${config.serverUrl}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "No se pudo consultar");
  } catch (error) {
    setStatus("No pude responder");
    adviceElement.textContent = error.message;
    window.yanapay.setWakeListening(true);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  config = await window.yanapay.runtimeConfig();
  connectEvents();
  document.querySelector("#close").addEventListener("click", window.yanapay.close);
  document.querySelector("#minimize").addEventListener("click", window.yanapay.minimize);
  window.yanapay.onVoiceHotkey(listenAndAsk);
  window.yanapay.onWakeLoading(() => {
    setStatus("Cargando reconocimiento de voz…");
  });
  window.yanapay.onWakeReady(() => {
    setStatus(`Di “${config.wakeWord}” seguido de tu pregunta`);
  });
  window.yanapay.onWakeDetected(() => {
    setStatus("Te escucho…");
    adviceElement.textContent = "Procesando tu pregunta.";
  });
  window.yanapay.onVoiceQuestion((event) => {
    askQuestion(event.text);
  });
  window.yanapay.onWakeTimeout(() => {
    setStatus(`Di “${config.wakeWord}” para hablar`);
    adviceElement.textContent = "No escuché una pregunta.";
  });
  window.yanapay.onWakeError((message) => {
    setStatus("Escucha automática no disponible");
    adviceElement.textContent = message;
  });
  window.yanapay.onDotaStatus((running) => {
    setStatus(running ? "Dota 2 detectado" : "Esperando que inicies Dota 2");
  });
});
