import assert from "node:assert/strict";
import test from "node:test";
import { DeltaFilter } from "../src/delta-filter.js";

test("solo envia cambios relevantes y respeta el intervalo minimo", () => {
  const filter = new DeltaFilter({ minIntervalMs: 5000 });
  const state = { game: { time: 60 }, hero: { healthPercent: 95 }, items: [] };

  assert.equal(filter.shouldSend(state, 1000), true);
  assert.equal(filter.shouldSend(state, 2000), false);
  assert.equal(filter.shouldSend({ ...state, hero: { healthPercent: 55 } }, 3000), false);
  assert.equal(filter.shouldSend({ ...state, hero: { healthPercent: 55 } }, 7000), true);
});
