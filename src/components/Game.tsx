
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { GameState, HexData, Player, UnitType, UNIT_STATS } from '../game/types';
import { HexGrid } from './HexGrid';
import { generateRandomMap } from '../game/mapGenerator';
import { axialToKey, getNeighbors, keyToAxial } from '../game/hex';
import { canCapture, getTerritories, processTurn, getMergedUnit, calculateUpkeep, checkWinner, getReachableHexes } from '../game/engine';
import { 
  Coins, 
  User, 
  Sword, 
  Shield, 
  Crown, 
  Castle, 
  ChevronRight, 
  RotateCcw,
  Trophy
} from 'lucide-react';
import _ from 'lodash';

const INITIAL_PLAYERS: Player[] = [
  { id: '1', name: 'Player 1', color: '#ef4444', gold: 10 },
  { id: '2', name: 'Player 2', color: '#3b82f6', gold: 10 },
  { id: '3', name: 'Player 3', color: '#10b981', gold: 10 },
];

import { useAuth } from '../AuthProvider';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { signInWithPopup, signOut } from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  addDoc, 
  serverTimestamp,
  getDoc
} from 'firebase/firestore';

import { runAITurnAsync } from '../game/ai';

export const Game: React.FC = () => {
  const { user, loading: authLoading, isAuthReady } = useAuth();
  const [state, setState] = useState<GameState | null>(null);
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [selectedUnitType, setSelectedUnitType] = useState<UnitType | null>(null);
  const [highlightedHexes, setHighlightedHexes] = useState<Set<string>>(new Set());
  const [winner, setWinner] = useState<string | null>(null);
  const [isLobby, setIsLobby] = useState(true);
  const [aiCount, setAiCount] = useState(2);
  const [hoveredTerritory, setHoveredTerritory] = useState<Set<string>>(new Set());
  const [gameId, setGameId] = useState<string | null>(null);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Listen for remote state changes
  useEffect(() => {
    if (gameId && isAuthReady) {
      const gameRef = doc(db, 'games', gameId);
      const unsubscribe = onSnapshot(gameRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as GameState;
          
          const remoteTurnId = data.players[data.currentTurn].id;
          const localTurnId = stateRef.current?.players[stateRef.current?.currentTurn]?.id;
          
          // Update local state if:
          // 1. It's not our turn (we should follow remote state)
          // 2. It just became our turn (AI finished its turn)
          // 3. We are in the lobby or game just started
          if (remoteTurnId !== user?.uid || (remoteTurnId === user?.uid && localTurnId !== user?.uid) || !stateRef.current) {
            setState(data);
            stateRef.current = data;
          }
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `games/${gameId}`);
      });
      return () => unsubscribe();
    }
  }, [gameId, isAuthReady, user?.uid]);

  const updateGameState = async (newState: GameState) => {
    setState(newState);
    stateRef.current = newState;
    if (gameId) {
      try {
        const gameRef = doc(db, 'games', gameId);
        await setDoc(gameRef, {
          ...newState,
          lastUpdated: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `games/${gameId}`);
      }
    }
  };

  // AI Turn handling
  const currentTurn = state?.currentTurn;
  const gameStatus = state?.status;
  const isAIProcessingRef = useRef(false);

  useEffect(() => {
    if (state && gameStatus === 'playing' && !winner) {
      const currentPlayer = state.players[state.currentTurn];
      if (currentPlayer.isAI && !isAIProcessingRef.current) {
        console.log(`AI Turn starting for ${currentPlayer.name} (${currentPlayer.id})`);
        isAIProcessingRef.current = true;
        setIsAIProcessing(true);
        
        const timer = setTimeout(async () => {
          try {
            const currentState = stateRef.current;
            if (!currentState || currentState.status !== 'playing') {
              console.log("AI Turn aborted: state invalid or not playing");
              return;
            }
            
            // Re-verify it's still this AI's turn
            const currentPlayerInLatest = currentState.players[currentState.currentTurn];
            if (!currentPlayerInLatest || !currentPlayerInLatest.isAI || currentPlayerInLatest.id !== currentPlayer.id) {
              console.log("AI Turn aborted: no longer this AI's turn");
              return;
            }

            console.log(`AI ${currentPlayer.name} is thinking...`);
            
            const aiProcessedState = await runAITurnAsync(currentState, currentPlayerInLatest.id, async (stepState) => {
              // Update state for each step and wait 0.3s
              await updateGameState(stepState);
              await new Promise(resolve => setTimeout(resolve, 300));
            });
            
            const nextState = _.cloneDeep(aiProcessedState);
            nextState.currentTurn = (nextState.currentTurn + 1) % nextState.players.length;
            
            console.log(`AI ${currentPlayer.name} finished. Next turn: ${nextState.currentTurn}`);
            // Process the next player's turn (income, upkeep, reset movement)
            const finalState = processTurn(nextState, nextState.players[nextState.currentTurn].id);
            
            const gameWinner = checkWinner(finalState);
            if (gameWinner) {
              finalState.status = 'finished';
              finalState.winnerId = gameWinner;
              setWinner(gameWinner);
            }

            await updateGameState(finalState);
          } catch (error) {
            console.error("AI turn error:", error);
          } finally {
            isAIProcessingRef.current = false;
            setIsAIProcessing(false);
          }
        }, 1000); // 1 second delay for AI turn
        
        return () => {
          clearTimeout(timer);
          isAIProcessingRef.current = false;
          setIsAIProcessing(false);
        };
      }
    }
  }, [currentTurn, gameStatus, winner, gameId]);

  const startGame = async () => {
    const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    
    const initialPlayers: Player[] = [];
    
    // Add human player
    initialPlayers.push({
      id: user?.uid || '1',
      name: user?.displayName || 'Player 1',
      color: colors[0],
      gold: 20
    });

    // Add AI players
    for (let i = 0; i < aiCount; i++) {
      initialPlayers.push({
        id: `ai-${i + 1}`,
        name: `AI Player ${i + 1}`,
        color: colors[(i + 1) % colors.length],
        gold: 20,
        isAI: true
      });
    }

    const map = generateRandomMap(7, initialPlayers);
    
    let newState: GameState = {
      id: 'local',
      players: initialPlayers,
      map,
      currentTurn: 0,
      status: 'playing',
    };

    // Process the first player's turn (income, upkeep, reset movement)
    newState = processTurn(newState, initialPlayers[0].id);

    stateRef.current = newState;
    if (user) {
      try {
        const docRef = await addDoc(collection(db, 'games'), {
          ...newState,
          lastUpdated: serverTimestamp(),
        });
        setGameId(docRef.id);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'games');
      }
    }

    setState(newState);
    setIsLobby(false);
  };

  const login = () => signInWithPopup(auth, googleProvider);
  const logout = () => signOut(auth);

  const handleHexHover = (key: string | null) => {
    if (!state || !key) {
      setHoveredTerritory(new Set());
      return;
    }
    const hex = state.map[key];
    if (!hex.ownerId) {
      setHoveredTerritory(new Set());
      return;
    }
    const territories = getTerritories(state.map, hex.ownerId);
    const territory = territories.find(t => t.includes(key));
    if (territory) {
      setHoveredTerritory(new Set(territory));
    }
  };

  useEffect(() => {
    if (state) {
      const winId = checkWinner(state);
      if (winId) setWinner(winId);
    }
  }, [state]);

  const currentPlayer = state?.players[state.currentTurn];

  if (isLobby) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950 p-6">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="max-w-md w-full bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl text-center"
        >
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-900/20">
            <Sword size={40} className="text-white" />
          </div>
          <h1 className="text-3xl font-black mb-4">Slay Multiplayer</h1>
          <p className="text-slate-400 mb-8 leading-relaxed">
            Conquer the land, manage your economy, and outsmart your opponents in this hexagonal strategy game.
          </p>
          
          <div className="space-y-4 mb-8">
            {user ? (
              <div className="flex items-center justify-between p-4 bg-slate-800 rounded-xl border border-slate-700">
                <div className="flex items-center gap-3">
                  <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full border border-slate-600" />
                  <div className="text-left">
                    <p className="text-xs text-slate-500 uppercase font-bold">Logged In As</p>
                    <p className="font-medium">{user.displayName}</p>
                  </div>
                </div>
                <button onClick={logout} className="text-xs text-slate-500 hover:text-red-400 font-bold uppercase">Logout</button>
              </div>
            ) : (
              <button 
                onClick={login}
                className="w-full flex items-center justify-center gap-3 p-4 bg-white text-black rounded-xl font-bold hover:bg-slate-200 transition-all"
              >
                <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="" />
                Sign in with Google
              </button>
            )}
            
            <div className="flex items-center gap-3 p-4 bg-slate-800 rounded-xl border border-slate-700">
              <User size={20} className="text-blue-400" />
              <div className="text-left flex-1">
                <p className="text-xs text-slate-500 uppercase font-bold">Game Mode</p>
                <p className="font-medium">{user ? 'Multiplayer Enabled' : 'Local Multiplayer'}</p>
              </div>
            </div>

            <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
                    <User size={16} className="text-slate-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-slate-500 uppercase font-bold">AI Opponents</p>
                    <p className="font-medium">{aiCount} Players</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setAiCount(Math.max(1, aiCount - 1))}
                    className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    -
                  </button>
                  <button 
                    onClick={() => setAiCount(Math.min(5, aiCount + 1))}
                    className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(num => (
                  <div 
                    key={num}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${num <= aiCount ? 'bg-blue-500' : 'bg-slate-700'}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <button 
            onClick={startGame}
            className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-bold text-lg transition-all shadow-lg shadow-blue-900/20 active:scale-95"
          >
            Start Prototype
          </button>
        </motion.div>
      </div>
    );
  }

  if (!state || !currentPlayer) return <div>Loading...</div>;

  const handleHexClick = (key: string) => {
    if (!state || !currentPlayer || isAIProcessing) return;
    if (user && currentPlayer.id !== user.uid) return;

    const hex = state.map[key];
    if (!hex) return;

    // If a unit is selected for placement
    if (selectedUnitType) {
      // Check if clicking on own empty hex
      if (hex.ownerId === currentPlayer.id && !hex.unit) {
        const cost = UNIT_STATS[selectedUnitType as keyof typeof UNIT_STATS]?.cost || 0;
        if (currentPlayer.gold >= cost) {
          const newState = _.cloneDeep(state);
          newState.map[key].unit = selectedUnitType;
          // Recruited units retain their action
          newState.players[state.currentTurn].gold -= cost;
          updateGameState(newState);
          stateRef.current = newState;
          setSelectedUnitType(null);
          return;
        }
      }
      // If clicking elsewhere, deselect unit
      setSelectedUnitType(null);
      return;
    }

    // If a unit is already selected for movement
    if (selectedHex) {
      if (highlightedHexes.has(key)) {
        const attackerHex = state.map[selectedHex];
        const attackerLevel = UNIT_STATS[attackerHex.unit as keyof typeof UNIT_STATS]?.level || 0;
        
        if (canCapture(attackerLevel, key, state.map, currentPlayer.id)) {
          const newState = _.cloneDeep(state);
          const targetHex = newState.map[key];
          
          if (targetHex.ownerId === currentPlayer.id && targetHex.unit && targetHex.unit !== 'Tree') {
            // Merging logic
            const mergedType = getMergedUnit(attackerHex.unit as UnitType, targetHex.unit as UnitType);
            if (mergedType) {
              newState.map[key].unit = mergedType;
              // Merged units retain their action
              newState.map[selectedHex].unit = null;
            } else {
              // Swap or move if no merge possible? Usually in Slay you can't move to a hex with a unit unless merging.
              setSelectedHex(null);
              setHighlightedHexes(new Set());
              return;
            }
          } else if (targetHex.ownerId !== currentPlayer.id || !targetHex.unit || targetHex.unit === 'Tree') {
            // Move or Capture (including cutting trees)
            const isEnemyTerritory = targetHex.ownerId !== currentPlayer.id;
            const wasTown = targetHex.unit === 'Town';
            
            newState.map[key].ownerId = currentPlayer.id;
            newState.map[key].unit = attackerHex.unit;
            
            // Only lose action if moving into enemy territory
            if (isEnemyTerritory) {
              newState.map[key].hasMoved = true;
            }

            // Clear capital flag if we overwrote a town
            if (wasTown && isEnemyTerritory) {
              newState.map[key].isCapital = false;
            }

            newState.map[selectedHex].unit = null;
          }
          updateGameState(newState);
          stateRef.current = newState;
        }
      }
      setSelectedHex(null);
      setHighlightedHexes(new Set());
      return;
    }

    // Select a unit to move
    if (hex.ownerId === currentPlayer.id && hex.unit && hex.unit !== 'Town' && hex.unit !== 'Tower' && !hex.hasMoved) {
      setSelectedHex(key);
      const attackerLevel = UNIT_STATS[hex.unit as keyof typeof UNIT_STATS]?.level || 0;
      const reachable = getReachableHexes(key, state.map, currentPlayer.id, attackerLevel);
      setHighlightedHexes(reachable);
    }
  };

  const nextTurn = async () => {
    if (!state || !currentPlayer) return;
    let newState = _.cloneDeep(state);
    newState.currentTurn = (newState.currentTurn + 1) % newState.players.length;
    
    // Process the next player's turn (income, upkeep, reset movement)
    newState = processTurn(newState, newState.players[newState.currentTurn].id);
    
    stateRef.current = newState;
    const gameWinner = checkWinner(newState);
    if (gameWinner) {
      newState.status = 'finished';
      newState.winnerId = gameWinner;
      setWinner(gameWinner);
    }
    
    await updateGameState(newState);
    setSelectedHex(null);
    setSelectedUnitType(null);
    setHighlightedHexes(new Set());
  };

  if (!state || !currentPlayer) return <div>Loading...</div>;

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      <div className="flex-1 relative">
        <HexGrid 
          map={state.map} 
          players={state.players} 
          onHexClick={handleHexClick} 
          selectedHex={selectedHex || undefined}
          highlightedHexes={highlightedHexes}
          hoveredTerritory={hoveredTerritory}
          onHexHover={handleHexHover}
        />

        {winner && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-slate-900 p-12 rounded-3xl border border-slate-800 text-center shadow-2xl"
            >
              <Trophy size={80} className="text-yellow-400 mx-auto mb-6" />
              <h1 className="text-4xl font-black mb-2">Victory!</h1>
              <p className="text-xl text-slate-400 mb-8">
                {state.players.find(p => p.id === winner)?.name} has conquered the land.
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-500 px-8 py-3 rounded-xl font-bold transition-colors"
              >
                Play Again
              </button>
            </motion.div>
          </div>
        )}
      </div>

      <div className="w-80 bg-slate-900 border-l border-slate-800 p-6 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Slay Clone</h2>
          <button onClick={() => window.location.reload()} className="p-2 hover:bg-slate-800 rounded-full">
            <RotateCcw size={20} />
          </button>
        </div>

        <div className="p-4 rounded-xl bg-slate-800 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: currentPlayer.color }} />
            <span className="font-semibold">{currentPlayer.name}'s Turn</span>
            {isAIProcessing && (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="ml-auto"
              >
                <RotateCcw size={16} className="text-blue-400" />
              </motion.div>
            )}
          </div>
          <div className="flex items-center gap-2 text-yellow-400 font-mono text-lg mb-2">
            <Coins size={20} />
            <span>{currentPlayer.gold} Gold</span>
          </div>
          
          {/* Territory Stats */}
          <div className="text-xs text-slate-400 space-y-1 border-t border-slate-700 pt-2">
            {getTerritories(state.map, currentPlayer.id).map((t, i) => (
              <div key={i} className="flex justify-between">
                <span>Territory {i + 1} ({t.length} hexes)</span>
                <span className="text-green-400">+{t.length - calculateUpkeep(t, state.map)}/turn</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Buy Units</h3>
          {(['Peasant', 'Spearman', 'Knight', 'Baron', 'Tower'] as UnitType[]).map(type => {
            const stats = UNIT_STATS[type as keyof typeof UNIT_STATS];
            const canAfford = currentPlayer.gold >= stats.cost;
            const isUserTurn = !user || currentPlayer.id === user.uid;
            const isDisabled = !canAfford || isAIProcessing || !isUserTurn;

            return (
              <button
                key={type}
                disabled={isDisabled}
                onClick={() => setSelectedUnitType(selectedUnitType === type ? null : type)}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  selectedUnitType === type 
                    ? 'bg-blue-600 border-blue-400' 
                    : 'bg-slate-800 border-slate-700 hover:border-slate-500'
                } ${isDisabled && 'opacity-50 cursor-not-allowed'}`}
              >
                <div className="flex items-center gap-3">
                  {type === 'Peasant' && <User size={18} />}
                  {type === 'Spearman' && <Sword size={18} />}
                  {type === 'Knight' && <Shield size={18} />}
                  {type === 'Baron' && <Crown size={18} />}
                  {type === 'Tower' && <Castle size={18} />}
                  <span className="font-medium">{type}</span>
                </div>
                <div className="flex items-center gap-1 text-yellow-400 text-sm">
                  <Coins size={14} />
                  <span>{stats.cost}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 text-xs text-slate-400 space-y-2">
          <h4 className="font-bold text-slate-300 uppercase tracking-tighter">Rules</h4>
          <ul className="list-disc pl-4 space-y-1">
            <li>Each hex provides 1 Gold income.</li>
            <li>Units have upkeep costs. Don't go bankrupt!</li>
            <li>Higher level units capture lower level ones.</li>
            <li>Towers protect adjacent hexes from level 1-2 units.</li>
            <li>Merge units by moving one onto another.</li>
          </ul>
        </div>

        <button
          onClick={nextTurn}
          disabled={isAIProcessing || (user && currentPlayer.id !== user.uid)}
          className="mt-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 py-4 rounded-xl font-bold transition-colors"
        >
          {isAIProcessing ? 'AI Thinking...' : 'End Turn'}
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
};
