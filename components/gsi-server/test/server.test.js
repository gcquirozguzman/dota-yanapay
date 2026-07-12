import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { after, before, test } from "node:test";
import { createGsiServer } from "../src/app.js";

const fixedNow = new Date("2026-07-12T10:00:00.000Z");
const config = {
  host: "127.0.0.1",
  port: 0,
  authToken: "test-secret",
  maxBodyBytes: 1024 * 1024,
};

let server;
let baseUrl;
const adviceCoordinator = Object.assign(new EventEmitter(), {
  latest: null,
  automaticCalls: 0,
  async onState() { this.automaticCalls += 1; },
  async ask(_state, question) {
    return { advice: `Respuesta: ${question}`, priority: "medium", expiresInSeconds: 8 };
  },
});

before(async () => {
  ({ server } = createGsiServer(config, { now: () => fixedNow, adviceCoordinator }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("rechaza paquetes con token incorrecto", async () => {
  const response = await fetch(`${baseUrl}/gsi`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auth: { token: "incorrecto" } }),
  });
  assert.equal(response.status, 401);
});

test("acepta y normaliza un paquete GSI", async () => {
  const response = await fetch(`${baseUrl}/gsi`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      auth: { token: "test-secret" },
      map: { clock_time: 615, game_state: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" },
      player: { name: "Support", kills: 1, deaths: 2, assists: 8, gold: 1420 },
      hero: { name: "npc_dota_hero_crystal_maiden", level: 9, health: 650, mana: 440 },
      abilities: { ability0: { name: "crystal_maiden_crystal_nova", level: 4, cooldown: 3 } },
      items: { slot0: { name: "item_glimmer_cape", cooldown: 0, can_cast: true } },
    }),
  });
  assert.equal(response.status, 202);

  const stateResponse = await fetch(`${baseUrl}/state`);
  const snapshot = await stateResponse.json();
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.state.game.time, 615);
  assert.equal(snapshot.state.player.assists, 8);
  assert.equal(snapshot.state.hero.level, 9);
  assert.equal(snapshot.state.items[0].name, "item_glimmer_cape");
  assert.equal(snapshot.state.receivedAt, fixedNow.toISOString());
});

test("reporta salud y cantidad de paquetes", async () => {
  const response = await fetch(`${baseUrl}/health`);
  const health = await response.json();
  assert.equal(response.status, 200);
  assert.equal(health.status, "ok");
  assert.equal(health.packetsReceived, 1);
  assert.equal(health.lastPacketAgeMs, 0);
  assert.equal(health.aiEnabled, true);
});

test("combina posiciones de vision y responde preguntas", async () => {
  const visionResponse = await fetch(`${baseUrl}/vision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ players: [{ slot: 7, world: { x: 1200, y: -800 } }] }),
  });
  assert.equal(visionResponse.status, 202);

  const stateResponse = await fetch(`${baseUrl}/state`);
  const snapshot = await stateResponse.json();
  assert.equal(snapshot.state.vision.players[0].slot, 7);

  const askResponse = await fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "Que compro" }),
  });
  const answer = await askResponse.json();
  assert.equal(askResponse.status, 200);
  assert.equal(answer.advice.advice, "Respuesta: Que compro");
});

test("permite preguntas aunque Dota no haya enviado estado", async () => {
  const isolatedCoordinator = Object.assign(new EventEmitter(), {
    latest: null,
    async onState() {},
    async ask(state, question) {
      assert.equal(state.game.state, "DOTA_NOT_CONNECTED");
      return { advice: question, priority: "low", expiresInSeconds: 8 };
    },
  });
  const isolated = createGsiServer(config, {
    now: () => fixedNow,
    adviceCoordinator: isolatedCoordinator,
  }).server;
  await new Promise((resolve) => isolated.listen(0, "127.0.0.1", resolve));

  try {
    const url = `http://127.0.0.1:${isolated.address().port}/ask`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "Que hace Roshan" }),
    });
    assert.equal(response.status, 200);
  } finally {
    await new Promise((resolve) => isolated.close(resolve));
  }
});
