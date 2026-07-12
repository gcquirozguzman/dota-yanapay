function healthBucket(value) {
  return Number.isFinite(value) ? Math.floor(value / 20) : null;
}

function readyAbilities(abilities = []) {
  return abilities
    .filter((ability) => ability.ultimate || ability.level > 0)
    .map((ability) => `${ability.name}:${ability.cooldown === 0}`)
    .sort();
}

function visiblePlayers(vision) {
  return (vision?.players ?? [])
    .map((player) => {
      const x = Number.isFinite(player.world?.x) ? Math.round(player.world.x / 1000) : null;
      const y = Number.isFinite(player.world?.y) ? Math.round(player.world.y / 1000) : null;
      return `${player.slot}:${player.area ?? `${x},${y}`}`;
    })
    .sort();
}

export function relevantSnapshot(state) {
  return {
    gameState: state?.game?.state ?? null,
    timeBucket: Number.isFinite(state?.game?.time) ? Math.floor(state.game.time / 30) : null,
    scores: [state?.game?.radiantScore, state?.game?.direScore],
    hero: {
      level: state?.hero?.level,
      alive: state?.hero?.alive,
      health: healthBucket(state?.hero?.healthPercent),
      mana: healthBucket(state?.hero?.manaPercent),
    },
    items: (state?.items ?? []).map((item) => item.name).sort(),
    abilities: readyAbilities(state?.abilities),
    visiblePlayers: visiblePlayers(state?.vision),
  };
}

export class DeltaFilter {
  constructor(options = {}) {
    this.minIntervalMs = options.minIntervalMs ?? 5000;
    this.lastSentAt = 0;
    this.lastFingerprint = null;
  }

  shouldSend(state, now = Date.now()) {
    const fingerprint = JSON.stringify(relevantSnapshot(state));
    if (fingerprint === this.lastFingerprint) return false;
    if (this.lastSentAt && now - this.lastSentAt < this.minIntervalMs) return false;
    this.lastFingerprint = fingerprint;
    this.lastSentAt = now;
    return true;
  }

  markFailed() {
    this.lastFingerprint = null;
  }
}
