
import { HexData, Player, UnitType } from './types';
import { axialToKey, getNeighbors } from './hex';

export function generateRandomMap(radius: number, players: Player[]): Record<string, HexData> {
  const map: Record<string, HexData> = {};
  const allHexKeys: string[] = [];

  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      const key = axialToKey(q, r);
      allHexKeys.push(key);
      map[key] = {
        q,
        r,
        ownerId: null,
        unit: null,
      };
    }
  }

  if (!players || players.length === 0) {
    return map;
  }

  // 1. Randomly assign each hex to a player
  for (const key of allHexKeys) {
    const randomPlayer = players[Math.floor(Math.random() * players.length)];
    if (randomPlayer) {
      map[key].ownerId = randomPlayer.id;
    }
  }

  // 2. Balance the hexes so each player has roughly the same amount (+/- 1)
  let balanced = false;
  let iterations = 0; // Prevent infinite loops
  while (!balanced && iterations < 1000) {
    iterations++;
    // Count hexes per player
    const counts: Record<string, number> = {};
    players.forEach(p => counts[p.id] = 0);
    for (const key of allHexKeys) {
      const owner = map[key].ownerId;
      if (owner) counts[owner]++;
    }

    // Sort players by hex count descending (most hexes first)
    const sortedPlayers = [...players].sort((a, b) => counts[b.id] - counts[a.id]);
    const giver = sortedPlayers[0];
    const receiver = sortedPlayers[sortedPlayers.length - 1];

    if (!giver || !receiver) {
      break;
    }

    // If the difference between the player with the most hexes and the least is <= 1, we're balanced
    if (counts[giver.id] - counts[receiver.id] <= 1) {
      balanced = true;
      break;
    }

    // Find all hexes owned by giver
    const giverHexes = allHexKeys.filter(k => map[k].ownerId === giver.id);
    if (giverHexes.length === 0) {
      break;
    }
    
    // Pick a random hex and reassign
    const hexToReassign = giverHexes[Math.floor(Math.random() * giverHexes.length)];
    if (hexToReassign) {
      map[hexToReassign].ownerId = receiver.id;
    }
  }

  // Add 15% tree coverage to hexes
  Object.values(map).forEach(hex => {
    if (!hex.unit && Math.random() < 0.15) {
      hex.unit = 'Tree';
    }
  });

  return map;
}
