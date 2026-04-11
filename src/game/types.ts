
export type UnitType = 'Peasant' | 'Spearman' | 'Knight' | 'Baron' | 'Tower' | 'Town' | 'Tree' | 'Grave';

export interface Player {
  id: string;
  name: string;
  color: string;
  isAI?: boolean;
  hasSurrendered?: boolean;
  photoURL?: string;
  overallStats?: any;
  stats?: {
    unitsPurchased: number;
    goldEarned: number;
    tilesClaimed: number;
    goldSpent: number;
  };
}

export interface HexData {
  q: number;
  r: number;
  ownerId: string | null;
  unit: UnitType | null;
  isCapital?: boolean;
  hasMoved?: boolean;
  gold?: number;
}

export interface GameState {
  id: string;
  players: Player[];
  map: Record<string, HexData>;
  currentTurn: number; // Index of player
  status: 'lobby' | 'playing' | 'finished';
  winnerId?: string;
  joinCode?: string;
}

export const UNIT_STATS = {
  Peasant: { cost: 10, upkeep: 2, level: 1 },
  Spearman: { cost: 20, upkeep: 6, level: 2 },
  Knight: { cost: 30, upkeep: 18, level: 3 },
  Baron: { cost: 40, upkeep: 54, level: 4 },
  Tower: { cost: 15, upkeep: 0, level: 2 }, // Tower protects like a Spearman
} as const;
