import assert from "node:assert/strict";
import test from "node:test";
import { DeepSeekClient } from "../src/deepseek-client.js";

const config = {
  apiKey: "test-key",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  timeoutMs: 1000,
};

test("envia el estado con razonamiento desactivado y solicita JSON", async () => {
  let captured;
  const client = new DeepSeekClient(config, {
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              advice: "Empuja bot y conserva tu TP.",
              priority: "medium",
              expiresInSeconds: 8,
            }),
          },
        }],
      }), { status: 200 });
    },
  });

  const result = await client.getAdvice({ game: { time: 600 } });

  assert.equal(captured.url, "https://api.deepseek.com/chat/completions");
  assert.equal(captured.options.headers.authorization, "Bearer test-key");
  assert.equal(captured.body.model, "deepseek-v4-flash");
  assert.deepEqual(captured.body.thinking, { type: "disabled" });
  assert.deepEqual(captured.body.response_format, { type: "json_object" });
  assert.match(captured.body.messages[0].content, /en español/);
  assert.match(captured.body.messages[1].content, /600/);
  assert.deepEqual(result, {
    advice: "Empuja bot y conserva tu TP.",
    priority: "medium",
    expiresInSeconds: 8,
  });
});

test("expone errores HTTP sin incluir respuestas completas", async () => {
  const client = new DeepSeekClient(config, {
    fetchImpl: async () => new Response("saldo insuficiente", { status: 402 }),
  });

  await assert.rejects(
    client.getAdvice({}),
    /DeepSeek respondio 402: saldo insuficiente/,
  );
});

test("rechaza una configuracion sin API key", () => {
  assert.throws(
    () => new DeepSeekClient({ ...config, apiKey: "" }),
    /Configura DEEPSEEK_API_KEY/,
  );
});
