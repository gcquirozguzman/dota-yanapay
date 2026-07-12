import assert from "node:assert/strict";
import test from "node:test";
import { combineState } from "../src/index.js";

test("une GSI y vision sin modificar las entradas", () => {
  const gsi = { hero: { name: "axe" } };
  const vision = { players: [{ slot: 1 }] };
  const combined = combineState(gsi, vision);

  assert.deepEqual(combined, { ...gsi, vision });
  assert.equal("vision" in gsi, false);
});
