
import { GameState, HexData, Player, UnitType, UNIT_STATS } from './types';
import { axialToKey, getNeighbors, keyToAxial } from './hex';
import { canCapture, getTerritories, getMergedUnit, getReachableHexes, calculateUpkeep, calculateIncome } from './engine';
import _ from 'lodash';

export async function runAITurnAsync(
  state: GameState, 
  playerId: string,
  onStep: (state: GameState) => Promise<void>
): Promise<GameState> {
  let newState = _.cloneDeep(state);
  const player = newState.players.find(p => p.id === playerId);
  if (!player) return newState;

  const territories = getTerritories(newState.map, playerId);
  console.log(`AI ${playerId} has ${territories.length} territories`);
  
  for (let i = 0; i < territories.length; i++) {
    const territory = territories[i];
    console.log(`Processing territory ${i+1}/${territories.length} (size: ${territory.length})`);
    
    // 1. Movement Phase
    const unitsToMove = territory.filter(key => {
      const unit = newState.map[key].unit;
      return unit && unit !== 'Town' && unit !== 'Tower' && unit !== 'Tree' && unit !== 'Grave' && !newState.map[key].hasMoved;
    });

    console.log(`AI found ${unitsToMove.length} units to move in this territory`);

    for (const unitKey of unitsToMove) {
      const hex = newState.map[unitKey];
      const unitType = hex.unit as UnitType;
      const stats = UNIT_STATS[unitType as keyof typeof UNIT_STATS];
      if (!stats) continue;

      const reachable = getReachableHexes(unitKey, newState.map, playerId, stats.level);
      let bestMove: string | null = null;
      let bestMovePriority = -1;

      for (const targetKey of reachable) {
        const targetHex = newState.map[targetKey];
        if (!targetHex) continue;

        let priority = 0;
        if (targetHex.ownerId !== playerId) {
          priority = 10; // Capture enemy/neutral hex
          if (targetHex.unit === 'Town') priority = 50; // High priority for towns
          if (targetHex.unit === 'Tower') priority = 30;
          
          // Prefer capturing hexes that connect territories or expand borders
          const neighbors = getNeighbors(targetHex.q, targetHex.r);
          const ownNeighbors = neighbors.filter(n => {
            const nKey = axialToKey(n.q, n.r);
            return newState.map[nKey]?.ownerId === playerId;
          }).length;
          priority += ownNeighbors;
        } else if (!targetHex.unit) {
          // Move to empty own hex - prefer hexes near enemy
          const neighbors = getNeighbors(targetHex.q, targetHex.r);
          const enemyNeighbors = neighbors.filter(n => {
            const nKey = axialToKey(n.q, n.r);
            return newState.map[nKey] && newState.map[nKey].ownerId !== playerId;
          }).length;
          priority = enemyNeighbors > 0 ? 5 : 1; 
        } else if (targetHex.unit && targetHex.unit !== 'Town' && targetHex.unit !== 'Tower') {
          // Potential merge
          const merged = getMergedUnit(unitType, targetHex.unit as UnitType);
          if (merged) priority = 8;
        }

        // Add a small random factor to break ties and add variety
        priority += Math.random() * 2;

        if (priority > bestMovePriority) {
          bestMovePriority = priority;
          bestMove = targetKey;
        }
      }

      if (bestMove && bestMovePriority > 0) {
        console.log(`AI moving unit from ${unitKey} to ${bestMove} (priority: ${bestMovePriority.toFixed(2)})`);
        const targetHex = newState.map[bestMove];
        let moved = false;
        
        if (targetHex.ownerId === playerId && targetHex.unit) {
          const merged = getMergedUnit(unitType, targetHex.unit as UnitType);
          if (merged) {
            newState.map[bestMove].unit = merged;
            // Merged units retain their action
            newState.map[unitKey].unit = null;
            moved = true;
          }
        } else if (targetHex.ownerId !== playerId || !targetHex.unit) {
          const isEnemyTerritory = targetHex.ownerId !== playerId;
          const wasTown = targetHex.unit === 'Town';
          
          newState.map[bestMove].ownerId = playerId;
          newState.map[bestMove].unit = unitType;
          // Only lose action if moving into enemy territory
          if (isEnemyTerritory) {
            newState.map[bestMove].hasMoved = true;
          }
          newState.map[unitKey].unit = null;
          moved = true;
          
          // Clear capital flag if we overwrote a town
          if (wasTown && isEnemyTerritory) {
            newState.map[bestMove].isCapital = false;
          }
        }
        
        if (moved) {
          await onStep(newState);
        }
      }
    }
    
    // 2. Recruitment Phase
    const emptyHexes = territory.filter(key => !newState.map[key].unit);
    if (emptyHexes.length > 0) {
      // Calculate borders
      const borderHexes = territory.filter(key => {
        const { q, r } = keyToAxial(key);
        const neighbors = getNeighbors(q, r);
        return neighbors.some(n => {
          const nKey = axialToKey(n.q, n.r);
          return newState.map[nKey] && newState.map[nKey].ownerId !== playerId;
        });
      });

      // 1. Defensive Towers
      const vulnerableBorders = borderHexes.filter(key => {
        const hex = newState.map[key];
        if (hex.unit === 'Tower' || hex.unit === 'Town') return false;
        
        // Check if there is already a tower nearby (within 2 hexes)
        const { q, r } = keyToAxial(key);
        let hasNearbyTower = false;
        for (let dq = -2; dq <= 2; dq++) {
          for (let dr = Math.max(-2, -dq - 2); dr <= Math.min(2, -dq + 2); dr++) {
            const nKey = axialToKey(q + dq, r + dr);
            const nHex = newState.map[nKey];
            if (nHex && nHex.ownerId === playerId && nHex.unit === 'Tower') {
              hasNearbyTower = true;
              break;
            }
          }
          if (hasNearbyTower) break;
        }
        if (hasNearbyTower) return false;

        // Check if any neighbor has a unit
        const neighbors = getNeighbors(q, r);
        return neighbors.some(n => {
          const nKey = axialToKey(n.q, n.r);
          const nHex = newState.map[nKey];
          return nHex && nHex.ownerId !== playerId && nHex.unit;
        });
      });

      for (const key of vulnerableBorders) {
        if (player.gold >= 15 && !newState.map[key].unit) {
          newState.map[key].unit = 'Tower';
          // Towers can't move anyway, but we don't need to set hasMoved
          player.gold -= 15;
          await onStep(newState);
        }
      }

      const currentUpkeep = calculateUpkeep(territory, newState.map);
      const currentIncome = calculateIncome(territory, newState.map);
      const netIncome = currentIncome - currentUpkeep;

      // 2. Offensive Units
      while (player.gold >= 10) {
        // If we have very little gold and negative income, don't buy anything
        if (netIncome < 0 && player.gold < 10) break; 
        // If we have some gold but low income, be cautious but still allow buying a Peasant if we have no units
        const hasUnits = territory.some(key => {
          const u = newState.map[key].unit;
          return u && u !== 'Town' && u !== 'Tree' && u !== 'Grave';
        });
        if (netIncome < 1 && player.gold < 15 && hasUnits) break;

        const availableEmpty = territory.filter(key => !newState.map[key].unit);
        if (availableEmpty.length === 0) break;

        let typeToBuy: UnitType = 'Peasant';
        let cost = 10;

        if (player.gold >= 40 && Math.random() > 0.7) {
          typeToBuy = 'Knight';
          cost = 30;
        } else if (player.gold >= 25 && Math.random() > 0.5) {
          typeToBuy = 'Spearman';
          cost = 20;
        }

        // Find best spot for offensive unit (near enemy)
        let bestSpot = availableEmpty[0];
        let maxEnemyNeighbors = -1;

        for (const key of availableEmpty) {
          const { q, r } = keyToAxial(key);
          const neighbors = getNeighbors(q, r);
          const enemyNeighbors = neighbors.filter(n => {
            const nKey = axialToKey(n.q, n.r);
            return newState.map[nKey] && newState.map[nKey].ownerId !== playerId;
          }).length;

          if (enemyNeighbors > maxEnemyNeighbors) {
            maxEnemyNeighbors = enemyNeighbors;
            bestSpot = key;
          }
        }

        console.log(`AI recruiting ${typeToBuy} at ${bestSpot} (cost: ${cost})`);
        newState.map[bestSpot].unit = typeToBuy;
        // Recruited units retain their action
        player.gold -= cost;
        await onStep(newState);
      }
    }
  }

  return newState;
}

