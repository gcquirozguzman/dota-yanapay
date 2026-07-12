import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { combineState } from "@dota-yanapay/state-combiner";
import { normalizeGsi } from "./normalize.js";
import { createStateStore } from "./state-store.js";

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(body));
};

function tokensMatch(received, expected) {
  if (typeof received !== "string" || typeof expected !== "string") return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readJson(request, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        const error = new Error("El payload supera el limite permitido");
        error.statusCode = 413;
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        const error = new Error("JSON invalido");
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

export function createGsiServer(config, dependencies = {}) {
  const store = dependencies.store ?? createStateStore();
  const now = dependencies.now ?? (() => new Date());
  const adviceCoordinator = dependencies.adviceCoordinator ?? null;
  let vision = null;

  const combinedState = () => combineState(store.snapshot().state, vision);

  const requestAutomaticAdvice = () => {
    const state = combinedState();
    if (!state || !adviceCoordinator) return;
    adviceCoordinator.onState(state).catch((error) => {
      console.error(`Consejo automatico fallido: ${error.message}`);
    });
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
      });
      response.end();
      return undefined;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      const snapshot = store.snapshot();
      const lastReceivedAt = snapshot.state?.receivedAt ?? null;
      return sendJson(response, 200, {
        status: "ok",
        packetsReceived: snapshot.version,
        lastReceivedAt,
        lastPacketAgeMs: lastReceivedAt
          ? Math.max(0, now().getTime() - Date.parse(lastReceivedAt))
          : null,
        aiEnabled: Boolean(adviceCoordinator),
        visionConnected: Boolean(vision),
      });
    }

    if (request.method === "GET" && url.pathname === "/state") {
      const snapshot = store.snapshot();
      return sendJson(response, snapshot.state ? 200 : 404, {
        ...snapshot,
        state: combinedState(),
      });
    }

    if (request.method === "GET" && url.pathname === "/advice") {
      return sendJson(response, adviceCoordinator?.latest ? 200 : 404, {
        advice: adviceCoordinator?.latest ?? null,
      });
    }

    if (request.method === "GET" && url.pathname === "/events") {
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      });
      response.write(`event: status\ndata: ${JSON.stringify({ connected: true })}\n\n`);

      if (!adviceCoordinator) {
        response.write(`event: status\ndata: ${JSON.stringify({ aiEnabled: false })}\n\n`);
        return undefined;
      }

      const onAdvice = (advice) => {
        response.write(`event: advice\ndata: ${JSON.stringify(advice)}\n\n`);
      };
      const onError = (error) => {
        response.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
      };
      adviceCoordinator.on("advice", onAdvice);
      adviceCoordinator.on("requestError", onError);
      request.on("close", () => {
        adviceCoordinator.off("advice", onAdvice);
        adviceCoordinator.off("requestError", onError);
      });
      return undefined;
    }

    if (request.method === "POST" && url.pathname === "/gsi") {
      try {
        const payload = await readJson(request, config.maxBodyBytes);
        if (!tokensMatch(payload?.auth?.token, config.authToken)) {
          return sendJson(response, 401, { error: "Token GSI invalido" });
        }
        const state = normalizeGsi(payload, now());
        const version = store.update(state);
        requestAutomaticAdvice();
        return sendJson(response, 202, { accepted: true, version });
      } catch (error) {
        if (!response.headersSent) {
          return sendJson(response, error.statusCode ?? 500, {
            error: error.statusCode ? error.message : "Error interno",
          });
        }
        return undefined;
      }
    }

    if (request.method === "POST" && url.pathname === "/vision") {
      try {
        const payload = await readJson(request, config.maxBodyBytes);
        if (!Array.isArray(payload?.players)) {
          return sendJson(response, 400, { error: "Vision requiere un arreglo players" });
        }
        vision = {
          ...payload,
          receivedAt: now().toISOString(),
        };
        requestAutomaticAdvice();
        return sendJson(response, 202, { accepted: true });
      } catch (error) {
        return sendJson(response, error.statusCode ?? 500, {
          error: error.statusCode ? error.message : "Error interno",
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/ask") {
      if (!adviceCoordinator) {
        return sendJson(response, 503, { error: "DeepSeek no esta configurado" });
      }
      const state = combinedState() ?? {
        source: "no_game",
        game: { state: "DOTA_NOT_CONNECTED" },
      };
      try {
        const payload = await readJson(request, config.maxBodyBytes);
        const advice = await adviceCoordinator.ask(state, payload?.question);
        return sendJson(response, 200, { advice });
      } catch (error) {
        return sendJson(response, 400, { error: error.message });
      }
    }

    return sendJson(response, 404, { error: "Ruta no encontrada" });
  });

  return { server, store, combinedState };
}
