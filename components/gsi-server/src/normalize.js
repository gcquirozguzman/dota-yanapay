function compactItems(items = {}) {
  return Object.values(items)
    .filter((item) => item && item.name && item.name !== "empty")
    .map((item) => ({
      name: item.name,
      charges: item.charges ?? 0,
      cooldown: item.cooldown ?? 0,
      ...(item.can_cast !== undefined && { canCast: item.can_cast }),
    }));
}

function compactAbilities(abilities = {}) {
  return Object.values(abilities)
    .filter((ability) => ability && ability.name)
    .map((ability) => ({
      name: ability.name,
      level: ability.level ?? 0,
      cooldown: ability.cooldown ?? 0,
      ...(ability.can_cast !== undefined && { canCast: ability.can_cast }),
      ...(ability.ultimate !== undefined && { ultimate: ability.ultimate }),
    }));
}

/** Convierte el payload verboso de Dota en el contrato interno inicial. */
export function normalizeGsi(payload, receivedAt = new Date()) {
  const { provider = {}, map = {}, player = {}, hero = {} } = payload;

  return {
    source: "gsi",
    receivedAt: receivedAt.toISOString(),
    game: {
      time: map.clock_time ?? null,
      state: map.game_state ?? null,
      paused: map.paused ?? false,
      winTeam: map.win_team ?? null,
      radiantScore: map.radiant_score ?? null,
      direScore: map.dire_score ?? null,
      wardPurchaseCooldown: map.ward_purchase_cooldown ?? null,
    },
    player: {
      steamId: provider.steamid ?? player.steamid ?? null,
      name: player.name ?? null,
      team: player.team_name ?? null,
      activity: player.activity ?? null,
      kills: player.kills ?? 0,
      deaths: player.deaths ?? 0,
      assists: player.assists ?? 0,
      lastHits: player.last_hits ?? 0,
      denies: player.denies ?? 0,
      gold: player.gold ?? 0,
      reliableGold: player.gold_reliable ?? 0,
      unreliableGold: player.gold_unreliable ?? 0,
      goldPerMinute: player.gpm ?? 0,
      xpPerMinute: player.xpm ?? 0,
    },
    hero: {
      name: hero.name ?? null,
      level: hero.level ?? 0,
      alive: hero.alive ?? null,
      respawnSeconds: hero.respawn_seconds ?? 0,
      health: hero.health ?? 0,
      maxHealth: hero.max_health ?? 0,
      healthPercent: hero.health_percent ?? 0,
      mana: hero.mana ?? 0,
      maxMana: hero.max_mana ?? 0,
      manaPercent: hero.mana_percent ?? 0,
      silenced: hero.silenced ?? false,
      stunned: hero.stunned ?? false,
      disarmed: hero.disarmed ?? false,
      magicImmune: hero.magicimmune ?? false,
      smoked: hero.smoked ?? false,
    },
    abilities: compactAbilities(payload.abilities),
    items: compactItems(payload.items),
    buildings: payload.buildings ?? {},
  };
}
