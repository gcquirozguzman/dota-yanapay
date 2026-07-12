import { DeepSeekClient } from "./deepseek-client.js";
import { loadApiConfig } from "./config.js";

const sampleState = {
  game: { time: 615, state: "in_progress", radiantScore: 12, direScore: 9 },
  player: { hero: "crystal_maiden", level: 9, gold: 1420, kills: 1, deaths: 2, assists: 8 },
  hero: { healthPercent: 72, manaPercent: 55 },
  items: [{ name: "item_glimmer_cape", cooldown: 0, canCast: true }],
  visibleEnemies: [{ area: "top" }, { area: "top_river" }],
};

const client = new DeepSeekClient(loadApiConfig());
const startedAt = performance.now();
const advice = await client.getAdvice(sampleState);

console.log(JSON.stringify({
  latencyMs: Math.round(performance.now() - startedAt),
  ...advice,
}, null, 2));
