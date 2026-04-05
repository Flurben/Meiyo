
import { GameState, HexData, Player, UnitType, UNIT_STATS } from './types';
import { axialToKey, getNeighbors, keyToAxial } from './hex';
import _ from 'lodash';

export function getTerritories(map: Record<string, HexData>, playerId: string): string[][] {
  const visited = new Set<string>();
  const territories: string[][] = [];

  for (const key in map) {
    const hex = map[key];
    if (hex.ownerId === playerId && !visited.has(key)) {
      const territory: string[] = [];
      const queue = [key];
      visited.add(key);

      while (queue.length > 0) {
        const currentKey = queue.shift()!;
        territory.push(currentKey);
        const { q, r } = keyToAxial(currentKey);
        const neighbors = getNeighbors(q, r);

        for (const neighbor of neighbors) {
          const neighborKey = axialToKey(neighbor.q, neighbor.r);
          if (map[neighborKey]?.ownerId === playerId && !visited.has(neighborKey)) {
            visited.add(neighborKey);
            queue.push(neighborKey);
          }
        }
      }
      territories.push(territory);
    }
  }
  return territories;
}

export function calculateIncome(territory: string[], map: Record<string, HexData>): number {
  return territory.filter(key => map[key].unit !== 'Tree').length;
}

export function calculateUpkeep(territory: string[], map: Record<string, HexData>): number {
  let upkeep = 0;
  for (const key of territory) {
    const unit = map[key].unit;
    if (unit && UNIT_STATS[unit as keyof typeof UNIT_STATS]) {
      upkeep += UNIT_STATS[unit as keyof typeof UNIT_STATS].upkeep;
    }
  }
  return upkeep;
}

export function canCapture(attackerLevel: number, targetKey: string, map: Record<string, HexData>, attackerId: string): boolean {
  const targetHex = map[targetKey];
  if (!targetHex) return false;
  if (targetHex.ownerId === attackerId) return true; // Moving within own territory is always allowed

  // Check target hex defense
  let maxDefense = 0;
  if (targetHex.unit) {
    maxDefense = Math.max(maxDefense, UNIT_STATS[targetHex.unit as keyof typeof UNIT_STATS]?.level || 0);
    if (targetHex.unit === 'Tower') maxDefense = 2;
    if (targetHex.unit === 'Town') maxDefense = 1;
  }

  // Check neighbors for protection
  const { q, r } = keyToAxial(targetKey);
  const neighbors = getNeighbors(q, r);
  for (const neighbor of neighbors) {
    const neighborKey = axialToKey(neighbor.q, neighbor.r);
    const neighborHex = map[neighborKey];
    if (neighborHex?.ownerId === targetHex.ownerId) {
      if (neighborHex.unit === 'Tower') maxDefense = Math.max(maxDefense, 2);
      if (neighborHex.unit && UNIT_STATS[neighborHex.unit as keyof typeof UNIT_STATS]) {
        maxDefense = Math.max(maxDefense, UNIT_STATS[neighborHex.unit as keyof typeof UNIT_STATS].level);
      }
    }
  }

  return attackerLevel > maxDefense;
}

export function getMergedUnit(unitA: UnitType, unitB: UnitType): UnitType | null {
  const levelA = UNIT_STATS[unitA as keyof typeof UNIT_STATS]?.level || 0;
  const levelB = UNIT_STATS[unitB as keyof typeof UNIT_STATS]?.level || 0;
  
  const combinedLevel = levelA + levelB;
  if (combinedLevel === 2) return 'Spearman';
  if (combinedLevel === 3) return 'Knight';
  if (combinedLevel >= 4) return 'Baron';
  return null;
}

export function updateTerritories(state: GameState): GameState {
  const newState = _.cloneDeep(state);
  
  // For each player, find their territories
  newState.players.forEach(player => {
    const territories = getTerritories(newState.map, player.id);
    
    territories.forEach(territory => {
      // If a city is completely isolated (no surrounding friendly hexes), it disappears
      if (territory.length === 1) {
        const key = territory[0];
        if (newState.map[key].unit === 'Town') {
          newState.map[key].unit = null;
          newState.map[key].isCapital = false;
          newState.map[key].ownerId = null;
          return;
        }
      }

      // Check if this territory has a Town
      let townCount = 0;
      territory.forEach(key => {
        if (newState.map[key].unit === 'Town') {
          townCount++;
        }
        // Clear isCapital for all hexes initially to ensure no stray dots
        newState.map[key].isCapital = false;
      });
      
      // If no Town, assign one to a random hex in the territory
      if (townCount === 0 && territory.length > 0) {
        const randomKey = territory[Math.floor(Math.random() * territory.length)];
        newState.map[randomKey].unit = 'Town';
        newState.map[randomKey].isCapital = true;
      } else if (townCount > 0) {
        // If multiple towns (e.g., from merging), keep only one
        let keptOne = false;
        territory.forEach(key => {
          if (newState.map[key].unit === 'Town') {
            if (!keptOne) {
              keptOne = true;
              newState.map[key].isCapital = true;
            } else {
              newState.map[key].unit = null;
            }
          }
        });
      }
    });
  });

  return newState;
}

export function processTurn(state: GameState, playerId: string): GameState {
  let newState = _.cloneDeep(state);
  
  // Graves turn into Trees
  for (const key in newState.map) {
    if (newState.map[key].unit === 'Grave') {
      newState.map[key].unit = 'Tree';
    }
  }

  const territories = getTerritories(newState.map, playerId);
  
  // Reset hasMoved for all units of this player
  for (const key in newState.map) {
    if (newState.map[key].ownerId === playerId) {
      newState.map[key].hasMoved = false;
    }
  }

  for (const territory of territories) {
    const income = calculateIncome(territory, newState.map);
    const upkeep = calculateUpkeep(territory, newState.map);
    
    const player = newState.players.find(p => p.id === playerId);
    if (player) {
      player.gold += income - upkeep;
      
      // If bankrupt, units die
      if (player.gold < 0) {
        player.gold = 0;
        for (const key of territory) {
          const hex = newState.map[key];
          if (hex.unit && hex.unit !== 'Town' && hex.unit !== 'Tower') {
            hex.unit = 'Grave';
          }
        }
      }
    }

    // Trees spread
    for (const key of territory) {
       const hex = newState.map[key];
       if (hex.unit === 'Tree') {
         const neighbors = getNeighbors(hex.q, hex.r);
         for (const n of neighbors) {
           const nKey = axialToKey(n.q, n.r);
           const targetHex = newState.map[nKey];
           if (targetHex && !targetHex.unit) {
             if (Math.random() < 0.15) { // 15% chance to spread
               targetHex.unit = 'Tree';
             }
           }
         }
       }
    }
  }

  return updateTerritories(newState);
}

export function checkWinner(state: GameState): string | null {
  const activePlayers = new Set<string>();
  for (const key in state.map) {
    if (state.map[key].ownerId) {
      activePlayers.add(state.map[key].ownerId!);
    }
  }
  if (activePlayers.size === 1) {
    return Array.from(activePlayers)[0];
  }
  return null;
}

export function getReachableHexes(startKey: string, map: Record<string, HexData>, playerId: string, unitLevel: number): Set<string> {
  const reachable = new Set<string>();
  const visited = new Set<string>();
  const queue: { key: string; distance: number }[] = [{ key: startKey, distance: 0 }];
  visited.add(startKey);

  while (queue.length > 0) {
    const { key, distance } = queue.shift()!;
    const { q, r } = keyToAxial(key);
    const neighbors = getNeighbors(q, r);

    for (const neighbor of neighbors) {
      const nKey = axialToKey(neighbor.q, neighbor.r);
      const targetHex = map[nKey];
      if (!targetHex || visited.has(nKey)) continue;

      if (targetHex.ownerId === playerId) {
        // Can move freely in own territory
        visited.add(nKey);
        reachable.add(nKey);
        queue.push({ key: nKey, distance: distance + 1 });
      } else {
        // Can move 1 hex into enemy territory if we can capture it
        if (canCapture(unitLevel, nKey, map, playerId)) {
          visited.add(nKey);
          reachable.add(nKey);
          // Don't add to queue because we can't move further into enemy territory in one turn
        }
      }
    }
  }

  return reachable;
}
