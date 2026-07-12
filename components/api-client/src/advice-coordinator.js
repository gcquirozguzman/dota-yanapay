import { EventEmitter } from "node:events";
import { DeltaFilter } from "./delta-filter.js";

export class AdviceCoordinator extends EventEmitter {
  constructor(client, options = {}) {
    super();
    this.client = client;
    this.filter = options.filter ?? new DeltaFilter(options);
    this.latest = null;
    this.currentRequest = null;
  }

  async onState(state) {
    const playableState = state?.game?.state?.includes("PRE_GAME")
      || state?.game?.state?.includes("GAME_IN_PROGRESS");
    if (!playableState || !state?.hero?.name) return null;
    if (this.currentRequest || !this.filter.shouldSend(state)) return null;
    return this.#startRequest(state, null, "automatic");
  }

  async ask(state, question) {
    if (typeof question !== "string" || !question.trim()) {
      throw new Error("La pregunta esta vacia");
    }
    if (this.currentRequest) {
      try {
        await this.currentRequest;
      } catch {
        // Una pregunta del jugador puede continuar aunque el consejo anterior falle.
      }
    }
    return this.#startRequest(state, question.trim(), "voice");
  }

  async #startRequest(state, question, source) {
    const operation = this.#request(state, question, source);
    this.currentRequest = operation;
    try {
      return await operation;
    } finally {
      if (this.currentRequest === operation) this.currentRequest = null;
    }
  }

  async #request(state, question, source) {
    try {
      const advice = await this.client.getAdvice(state, question);
      this.latest = { ...advice, source, question, createdAt: new Date().toISOString() };
      this.emit("advice", this.latest);
      return this.latest;
    } catch (error) {
      if (source === "automatic") this.filter.markFailed();
      this.emit("requestError", error);
      throw error;
    }
  }
}
