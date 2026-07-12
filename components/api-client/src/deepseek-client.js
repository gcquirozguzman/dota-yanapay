import { COACH_SYSTEM_PROMPT } from "./coach-prompt.js";

const PRIORITIES = new Set(["low", "medium", "high"]);

function validateAdvice(value) {
  if (!value || typeof value.advice !== "string" || !value.advice.trim()) {
    throw new Error("DeepSeek devolvio un consejo vacio o invalido");
  }
  if (!PRIORITIES.has(value.priority)) {
    throw new Error("DeepSeek devolvio una prioridad invalida");
  }
  if (!Number.isFinite(value.expiresInSeconds) || value.expiresInSeconds <= 0) {
    throw new Error("DeepSeek devolvio una expiracion invalida");
  }

  return {
    advice: value.advice.trim(),
    priority: value.priority,
    expiresInSeconds: Math.round(value.expiresInSeconds),
  };
}

async function readError(response) {
  const body = await response.text();
  return body.slice(0, 500) || response.statusText;
}

export class DeepSeekClient {
  constructor(config, options = {}) {
    if (!config.apiKey || config.apiKey === "reemplaza-con-tu-api-key") {
      throw new Error("Configura DEEPSEEK_API_KEY en .env");
    }
    this.config = config;
    this.fetch = options.fetchImpl ?? globalThis.fetch;
  }

  async getAdvice(state, question = null) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: "system", content: COACH_SYSTEM_PROMPT },
            {
              role: "user",
              content: JSON.stringify({
                ...(question && { question }),
                state,
              }),
            },
          ],
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 120,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await readError(response);
        throw new Error(`DeepSeek respondio ${response.status}: ${detail}`);
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error("Respuesta de DeepSeek sin contenido");
      }

      try {
        return validateAdvice(JSON.parse(content));
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error("DeepSeek no devolvio JSON valido");
        }
        throw error;
      }
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(`DeepSeek excedio el timeout de ${this.config.timeoutMs} ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
