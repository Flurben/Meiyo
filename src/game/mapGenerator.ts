
import { HexData, Player, UnitType } from './types';
import { axialToKey, getNeighbors } from './hex';

export function generateRandomMap(radius: number, players: Player[]): Record<string, HexData> {
  const map: Record<string, HexData> = {};

  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      const key = axialToKey(q, r);
      map[key] = {
        q,
        r,
        ownerId: null,
        unit: null,
      };
    }
  }

  // Assign starting hexes to players
  let availableKeys = Object.keys(map);
  players.forEach((player) => {
    if (availableKeys.length === 0) return;
    const randomIndex = Math.floor(Math.random() * availableKeys.length);
    const startKey = availableKeys[randomIndex];
    availableKeys.splice(randomIndex, 1); // Remove used key
    
    const hex = map[startKey];
    hex.ownerId = player.id;
    hex.unit = 'Town';
    hex.isCapital = true;

    // Give some initial territory
    const neighbors = getNeighbors(hex.q, hex.r);
    neighbors.forEach(n => {
      const nKey = axialToKey(n.q, n.r);
      if (map[nKey] && !map[nKey].ownerId) {
        map[nKey].ownerId = player.id;
        // Remove neighbors from available keys too to prevent players starting too close
        const nIndex = availableKeys.indexOf(nKey);
        if (nIndex > -1) availableKeys.splice(nIndex, 1);
      }
    });
  });

  // Add 15% tree coverage to remaining empty hexes
  Object.values(map).forEach(hex => {
    if (!hex.ownerId && !hex.unit) {
      if (Math.random() < 0.15) {
        hex.unit = 'Tree';
      }
    }
  });

  return map;
}
