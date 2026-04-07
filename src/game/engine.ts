
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
      if (neighborHex.unit === 'Town') maxDefense = Math.max(maxDefense, 1);
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

export function updateTerritories(state: GameState, oldState?: GameState): GameState {
  const newState = _.cloneDeep(state);
  
  // For each player, find their territories
  newState.players.forEach(player => {
    const newTerritories = getTerritories(newState.map, player.id);
    const oldTerritories = oldState ? getTerritories(oldState.map, player.id) : [];

    // Map old territories to their gold
    const oldTerritoryData = oldTerritories.map(territory => {
      let gold = 0;
      territory.forEach(key => {
        if (oldState!.map[key].isCapital) {
          gold += oldState!.map[key].gold || 0;
        }
      });
      return { hexes: territory, gold };
    });

    // Prepare new territories with assigned gold
    const newTerritoryData = newTerritories.map(territory => ({
      hexes: territory,
      assignedGold: 0,
      hasTown: territory.some(key => newState.map[key].unit === 'Town')
    }));

    if (oldState) {
      // Distribute gold
      oldTerritoryData.forEach(oldT => {
        if (oldT.gold <= 0) return;

        // Find intersecting new territories
        const intersecting = newTerritoryData.filter(newT => 
          newT.hexes.some(key => oldT.hexes.includes(key))
        );

        if (intersecting.length === 1) {
          intersecting[0].assignedGold += oldT.gold;
        } else if (intersecting.length > 1) {
          const totalHexes = intersecting.reduce((sum, t) => sum + t.hexes.length, 0);
          let remainingGold = oldT.gold;
          
          // Sort by size ascending so the largest gets the remainder
          const sorted = [...intersecting].sort((a, b) => a.hexes.length - b.hexes.length);
          
          sorted.forEach((t, index) => {
            if (index === sorted.length - 1) {
              t.assignedGold += remainingGold;
            } else {
              const share = Math.floor(oldT.gold * (t.hexes.length / totalHexes));
              t.assignedGold += share;
              remainingGold -= share;
            }
          });
        }
      });
    } else {
      // Fallback if no oldState: just sum up existing gold in the new territory
      newTerritoryData.forEach(newT => {
        let gold = 0;
        newT.hexes.forEach(key => {
          if (newState.map[key].isCapital) {
            gold += newState.map[key].gold || 0;
          }
        });
        newT.assignedGold = gold;
      });
    }

    // Now apply to newState
    newTerritoryData.forEach(newT => {
      const territory = newT.hexes;
      
      // If a city is completely isolated (no surrounding friendly hexes), it disappears
      if (territory.length === 1) {
        const key = territory[0];
        if (newState.map[key].unit === 'Town') {
          newState.map[key].unit = 'Tree';
          newState.map[key].isCapital = false;
          newState.map[key].gold = 0;
        }
        return;
      }

      // Check if this territory has a Town
      let townCount = 0;
      territory.forEach(key => {
        if (newState.map[key].unit === 'Town') {
          townCount++;
        }
        // Clear isCapital for all hexes initially to ensure no stray dots
        newState.map[key].isCapital = false;
        newState.map[key].gold = 0;
      });
      
      // If no Town, assign one to a random hex in the territory
      if (townCount === 0 && territory.length > 0) {
        const randomKey = territory[Math.floor(Math.random() * territory.length)];
        newState.map[randomKey].unit = 'Town';
        newState.map[randomKey].isCapital = true;
        newState.map[randomKey].gold = newT.assignedGold > 0 ? newT.assignedGold : 15;
      } else if (townCount > 0) {
        // If multiple towns (e.g., from merging), keep only one
        let keptOne = false;
        territory.forEach(key => {
          if (newState.map[key].unit === 'Town') {
            if (!keptOne) {
              keptOne = true;
              newState.map[key].isCapital = true;
              newState.map[key].gold = newT.assignedGold > 0 ? newT.assignedGold : 15;
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
    
    const pIndex = newState.players.findIndex(p => p.id === playerId);
    if (pIndex !== -1 && newState.players[pIndex].stats) {
      newState.players[pIndex].stats!.goldEarned += income;
    }

    // Find the capital hex for this territory
    const capitalKey = territory.find(key => newState.map[key].isCapital);
    if (capitalKey) {
      const capitalHex = newState.map[capitalKey];
      capitalHex.gold = (capitalHex.gold || 0) + income - upkeep;
      
      // If bankrupt, units die
      if (capitalHex.gold < 0) {
        capitalHex.gold = 0;
        for (const key of territory) {
          const hex = newState.map[key];
          if (hex.unit && hex.unit !== 'Town' && hex.unit !== 'Tower') {
            hex.unit = 'Grave';
          }
        }
      }
    } else {
      // No capital (e.g., 1-hex territory)
      const net = income - upkeep;
      if (net < 0) {
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
