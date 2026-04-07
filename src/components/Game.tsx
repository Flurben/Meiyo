
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { GameState, HexData, Player, UnitType, UNIT_STATS } from '../game/types';
import { HexGrid } from './HexGrid';
import { generateRandomMap } from '../game/mapGenerator';
import { axialToKey, getNeighbors, keyToAxial } from '../game/hex';
import { canCapture, getTerritories, processTurn, getMergedUnit, calculateUpkeep, calculateIncome, checkWinner, getReachableHexes, updateTerritories } from '../game/engine';
import { 
  Coins, 
  User, 
  Swords, 
  Shield, 
  Crown, 
  Castle, 
  ChevronRight, 
  RotateCcw,
  Trophy,
  HelpCircle,
  Flag,
  Bot,
  LogOut,
  Plus,
  Minus,
  SquarePen,
  ChartNoAxesCombined
} from 'lucide-react';
import _ from 'lodash';

const INITIAL_PLAYERS: Player[] = [
  { id: '1', name: 'Player 1', color: '#ef4444' },
  { id: '2', name: 'Player 2', color: '#3b82f6' },
  { id: '3', name: 'Player 3', color: '#10b981' },
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
  getDoc,
  updateDoc
} from 'firebase/firestore';

import { runAITurnAsync } from '../game/ai';
import { AuthModal } from './AuthModal';
import { StatsModal } from './StatsModal';
import { LobbyBrowser } from './LobbyBrowser';

export const Game: React.FC = () => {
  const { user, userData, loading: authLoading, isAuthReady } = useAuth();
  const [state, setState] = useState<GameState | null>(null);
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [radialMenu, setRadialMenu] = useState<{ x: number, y: number, hexKey: string } | null>(null);
  const [highlightedHexes, setHighlightedHexes] = useState<Set<string>>(new Set());
  const [winner, setWinner] = useState<string | null>(null);
  const [aiCount, setAiCount] = useState(2);
  const [hoveredTerritory, setHoveredTerritory] = useState<Set<string>>(new Set());
  const [gameId, setGameId] = useState<string | null>(null);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [isSurrenderHovered, setIsSurrenderHovered] = useState(false);
  
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [isLobbyBrowserOpen, setIsLobbyBrowserOpen] = useState(false);
  const [isEditingAlias, setIsEditingAlias] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
          
          const isHost = user?.uid === data.players[0].id;
          const isAITurn = data.players[data.currentTurn].isAI;
          
          // Update local state if:
          // 1. It's not our turn AND (it's not an AI turn OR we are not the host)
          // 2. It just became our turn (AI finished its turn)
          // 3. We are in the lobby or game just started
          const shouldUpdate = 
            data.status === 'lobby' ||
            (remoteTurnId !== user?.uid && !(isAITurn && isHost)) || 
            (remoteTurnId === user?.uid && localTurnId !== user?.uid) || 
            !stateRef.current;

          if (shouldUpdate) {
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
      stats: { unitsPurchased: 0, goldEarned: 0, tilesClaimed: 0, goldSpent: 0 }
    });

    // Add AI players
    for (let i = 0; i < aiCount; i++) {
      initialPlayers.push({
        id: `ai-${i + 1}`,
        name: `AI Player ${i + 1}`,
        color: colors[(i + 1) % colors.length],
        isAI: true,
        stats: { unitsPurchased: 0, goldEarned: 0, tilesClaimed: 0, goldSpent: 0 }
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
  };

  const hostGame = async () => {
    if (!user || !userData) return;
    
    const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    
    const initialPlayers: Player[] = [{
      id: user.uid,
      name: userData.alias || user.displayName || 'Player 1',
      color: colors[0],
      stats: { unitsPurchased: 0, goldEarned: 0, tilesClaimed: 0, goldSpent: 0 }
    }];

    const map = generateRandomMap(7, initialPlayers);
    
    let newState: GameState = {
      id: 'local', // will be overwritten by docRef.id
      players: initialPlayers,
      map,
      currentTurn: 0,
      status: 'lobby',
    };

    try {
      const docRef = await addDoc(collection(db, 'games'), {
        ...newState,
        lastUpdated: serverTimestamp(),
      });
      setGameId(docRef.id);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'games');
    }
  };

  const joinGame = async (gameIdToJoin: string) => {
    if (!user || !userData) return;
    
    try {
      const gameRef = doc(db, 'games', gameIdToJoin);
      const gameSnap = await getDoc(gameRef);
      
      if (gameSnap.exists()) {
        const gameData = gameSnap.data() as GameState;
        
        // Check if already in game
        if (gameData.players.some(p => p.id === user.uid)) {
          setGameId(gameIdToJoin);
          setIsLobbyBrowserOpen(false);
          return;
        }

        // Check if game is full (max 6 players)
        if (gameData.players.length >= 6) {
          alert("Game is full!");
          return;
        }

        const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
        const newPlayer: Player = {
          id: user.uid,
          name: userData.alias || user.displayName || `Player ${gameData.players.length + 1}`,
          color: colors[gameData.players.length % colors.length],
          stats: { unitsPurchased: 0, goldEarned: 0, tilesClaimed: 0, goldSpent: 0 }
        };

        await updateDoc(gameRef, {
          players: [...gameData.players, newPlayer],
          lastUpdated: serverTimestamp()
        });

        setGameId(gameIdToJoin);
        setIsLobbyBrowserOpen(false);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `games/${gameIdToJoin}`);
    }
  };

  const login = () => signInWithPopup(auth, googleProvider);
  const logout = () => signOut(auth);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 256 * 256 * 4) { // Rough check, better to check dimensions
      alert("File is too large.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.onload = async () => {
        if (img.width > 256 || img.height > 256) {
          alert("Image must be 256x256 pixels or smaller.");
          return;
        }
        
        const base64 = event.target?.result as string;
        try {
          await updateDoc(doc(db, 'users', user.uid), {
            photoURL: base64
          });
        } catch (error) {
          console.error("Error updating photo:", error);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleAliasSubmit = async () => {
    if (!user || !newAlias.trim() || newAlias.trim().length >= 50) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        alias: newAlias.trim()
      });
      setIsEditingAlias(false);
    } catch (error) {
      console.error("Error updating alias:", error);
    }
  };

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
      if (winId && !winner) {
        setWinner(winId);
        
        // Save stats if user is logged in
        if (user && userData) {
          const playerStats = state.players.find(p => p.id === user.uid)?.stats;
          if (playerStats) {
            const isWin = winId === user.uid;
            
            // 1. Create GameStats document
            addDoc(collection(db, `users/${user.uid}/gameStats`), {
              gameId: state.id,
              unitsPurchased: playerStats.unitsPurchased,
              goldEarned: playerStats.goldEarned,
              tilesClaimed: playerStats.tilesClaimed,
              isWin: isWin,
              timestamp: new Date().toISOString()
            }).catch(e => console.error("Error saving game stats:", e));

            // 2. Update overall user stats
            const currentStats = userData.stats || {
              wins: 0, losses: 0, gamesPlayed: 0, 
              totalGoldSpent: 0, totalGoldEarned: 0, totalTilesClaimed: 0
            };
            
            updateDoc(doc(db, 'users', user.uid), {
              stats: {
                wins: currentStats.wins + (isWin ? 1 : 0),
                losses: currentStats.losses + (isWin ? 0 : 1),
                gamesPlayed: currentStats.gamesPlayed + 1,
                totalGoldSpent: currentStats.totalGoldSpent + playerStats.goldSpent,
                totalGoldEarned: currentStats.totalGoldEarned + playerStats.goldEarned,
                totalTilesClaimed: currentStats.totalTilesClaimed + playerStats.tilesClaimed
              }
            }).catch(e => console.error("Error updating overall stats:", e));
          }
        }
      }
    }
  }, [state, winner, user, userData]);

  const currentPlayer = state?.players[state.currentTurn];

  const territoriesWithActions = useMemo(() => {
    if (!state || !currentPlayer) return new Set<string>();
    const active = new Set<string>();
    
    // Only calculate for the current player's turn
    if (user && currentPlayer.id !== user.uid) return active;

    const territories = getTerritories(state.map, currentPlayer.id);
    for (const territory of territories) {
      const capitalKey = territory.find(key => state.map[key].isCapital);
      if (!capitalKey) continue;
      
      const capital = state.map[capitalKey];
      let hasAction = false;

      // Check if territory can afford the cheapest unit (Peasant costs 10)
      if ((capital.gold || 0) >= 10) {
        hasAction = true;
      } else {
        // Check if any unit in the territory hasn't moved
        for (const key of territory) {
          const hex = state.map[key];
          if (hex.unit && hex.unit !== 'Town' && hex.unit !== 'Tower' && !hex.hasMoved) {
            hasAction = true;
            break;
          }
        }
      }

      if (hasAction) {
        active.add(capitalKey);
      }
    }
    return active;
  }, [state, currentPlayer, user]);

  if (!state && !gameId) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950 p-6">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="max-w-md w-full bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl text-center"
        >
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-900/20">
            <Swords size={70} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-white mb-4">Meiyo</h1>
          <p className="text-slate-200 mb-8 leading-relaxed">
            Conquer the land, manage your economy, and outsmart your opponents in this hexagonal strategy game.
          </p>
          
          <div className="space-y-4 mb-8">
            {user && userData ? (
              <div className="flex items-center justify-between p-4 bg-slate-800 rounded-xl border border-slate-700">
                <div className="flex items-center gap-3">
                  <div 
                    className="relative w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden group cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {userData.photoURL ? (
                      <img src={userData.photoURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
                        {userData.alias?.substring(0, 2).toUpperCase() || '??'}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <SquarePen size={20} className="text-white" />
                    </div>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/jpeg, image/png"
                    onChange={handleImageUpload}
                  />
                  <div className="text-left">
                    {isEditingAlias ? (
                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          value={newAlias}
                          onChange={(e) => setNewAlias(e.target.value)}
                          className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-sm w-32"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAliasSubmit();
                            if (e.key === 'Escape') setIsEditingAlias(false);
                          }}
                        />
                        <button onClick={handleAliasSubmit} className="text-green-400 hover:text-green-300 text-xs font-bold">SAVE</button>
                      </div>
                    ) : (
                      <p 
                        className="text-lg text-white font-bold cursor-pointer hover:text-blue-400 transition-colors flex items-center gap-2 group"
                        onClick={() => {
                          setNewAlias(userData.alias || '');
                          setIsEditingAlias(true);
                        }}
                      >
                        {userData.alias || 'Anonymous'}
                        <SquarePen size={14} className="opacity-0 group-hover:opacity-100 text-slate-400" />
                      </p>
                    )}
                    <p className="text-xs text-slate-500 uppercase font-bold">@{userData.displayName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setIsStatsModalOpen(true)} className="p-2 text-slate-400 hover:text-blue-400 transition-colors rounded-lg hover:bg-slate-700/50">
                    <ChartNoAxesCombined size={24} />
                  </button>
                  <button onClick={logout} className="p-2 text-slate-400 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-700/50">
                    <LogOut size={24} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setAuthModalMode('signin');
                    setIsAuthModalOpen(true);
                  }}
                  className="flex-1 p-4 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all border border-slate-700"
                >
                  Sign In
                </button>
                <button 
                  onClick={() => {
                    setAuthModalMode('signup');
                    setIsAuthModalOpen(true);
                  }}
                  className="flex-1 p-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20"
                >
                  Create Account
                </button>
              </div>
            )}
            
            <div className="flex items-center gap-3 p-4 bg-slate-800 rounded-xl border border-slate-700">
              <User size={40} className="text-blue-400" />
              <div className="text-left flex-1">
                <p className="text-s text-slate-500 uppercase font-bold">Game Mode</p>
                <p className="font-medium text-white">{user ? 'Multiplayer Enabled' : 'Local Singleplayer'}</p>
              </div>
            </div>

            <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Bot size={40} className="text-blue-400" />
                  <div className="text-left">
                    <p className="text-s text-slate-500 uppercase font-bold">AI Opponents</p>
                    <p className="font-medium text-white">{aiCount} AI Players</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setAiCount(Math.max(1, aiCount - 1))}
                    className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    <Minus size={15} className="text-white" />
                  </button>
                  <button 
                    onClick={() => setAiCount(Math.min(5, aiCount + 1))}
                    className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    <Plus size={15} className="text-white" />
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

          <div className="space-y-3">
            <button 
              onClick={startGame}
              className="w-full bg-slate-800 hover:bg-slate-700 py-4 rounded-xl font-bold text-lg text-white transition-all border border-slate-700 active:scale-95"
            >
              Start Singleplayer
            </button>
            
            {user && (
              <div className="flex gap-3">
                <button 
                  onClick={hostGame}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-bold text-lg text-white transition-all shadow-lg shadow-blue-900/20 active:scale-95"
                >
                  Host Game
                </button>
                <button 
                  onClick={() => setIsLobbyBrowserOpen(true)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-4 rounded-xl font-bold text-lg text-white transition-all shadow-lg shadow-emerald-900/20 active:scale-95"
                >
                  Join Game
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  if (!state || !currentPlayer) return <div>Loading...</div>;

  if (state.status === 'lobby') {
    const isHost = user?.uid === state.players[0]?.id;

    const startMultiplayerGame = async () => {
      if (!isHost || !gameId) return;
      
      let newState = _.cloneDeep(state);
      newState.status = 'playing';
      
      // Regenerate map with all joined players
      newState.map = generateRandomMap(7, newState.players);
      
      // Process the first player's turn (income, upkeep, reset movement)
      newState = processTurn(newState, newState.players[0].id);
      
      await updateGameState(newState);
    };

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-slate-900 p-8 rounded-3xl max-w-md w-full border border-slate-800 shadow-2xl"
        >
          <h1 className="text-3xl font-black text-white mb-6 text-center">Game Lobby</h1>
          
          <div className="space-y-4 mb-8">
            <h2 className="text-slate-400 font-bold uppercase text-sm">Players ({state.players.length}/6)</h2>
            <div className="space-y-2">
              {state.players.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="text-white font-medium flex-1">{p.name}</span>
                  {i === 0 && <Crown size={16} className="text-yellow-400" />}
                </div>
              ))}
            </div>
          </div>

          {isHost ? (
            <button 
              onClick={startMultiplayerGame}
              disabled={state.players.length < 2}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 py-4 rounded-xl font-bold text-lg text-white transition-all shadow-lg shadow-blue-900/20 active:scale-95"
            >
              {state.players.length < 2 ? 'Waiting for players...' : 'Start Game'}
            </button>
          ) : (
            <div className="text-center p-4 bg-slate-800 rounded-xl border border-slate-700">
              <p className="text-slate-400 font-medium">Waiting for host to start...</p>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  const handleHexRightClick = (key: string, e: React.MouseEvent) => {
    if (!state || !currentPlayer || isAIProcessing) return;
    if (user && currentPlayer.id !== user.uid) return;

    const hex = state.map[key];
    if (hex && hex.ownerId === currentPlayer.id && !hex.unit) {
      setRadialMenu({ x: e.clientX, y: e.clientY, hexKey: key });
    } else {
      setRadialMenu(null);
    }
  };

  const buyUnit = (unitType: UnitType, hexKey: string) => {
    if (!state || !currentPlayer) return;
    
    const hex = state.map[hexKey];
    if (!hex || hex.ownerId !== currentPlayer.id || hex.unit) return;

    const territories = getTerritories(state.map, currentPlayer.id);
    const territory = territories.find(t => t.includes(hexKey));
    if (!territory) return;

    const capitalKey = territory.find(k => state.map[k].isCapital);
    if (!capitalKey) return;

    const capital = state.map[capitalKey];
    const cost = UNIT_STATS[unitType as keyof typeof UNIT_STATS]?.cost || 0;

    if ((capital.gold || 0) >= cost) {
      let newState = _.cloneDeep(state);
      newState.map[hexKey].unit = unitType;
      newState.map[capitalKey].gold = (capital.gold || 0) - cost;
      
      const pIndex = newState.players.findIndex(p => p.id === currentPlayer.id);
      if (pIndex !== -1 && newState.players[pIndex].stats) {
        newState.players[pIndex].stats!.unitsPurchased++;
        newState.players[pIndex].stats!.goldSpent += cost;
      }

      newState = updateTerritories(newState, state);
      updateGameState(newState);
      stateRef.current = newState;
    }
    setRadialMenu(null);
  };

  const handleHexClick = (key: string) => {
    setRadialMenu(null);
    if (!state || !currentPlayer || isAIProcessing) return;
    if (user && currentPlayer.id !== user.uid) return;

    const hex = state.map[key];
    if (!hex) return;

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
            const wasTree = targetHex.unit === 'Tree';
            
            newState.map[key].ownerId = currentPlayer.id;
            newState.map[key].unit = attackerHex.unit;
            
            if (isEnemyTerritory) {
              const pIndex = newState.players.findIndex(p => p.id === currentPlayer.id);
              if (pIndex !== -1 && newState.players[pIndex].stats) {
                newState.players[pIndex].stats!.tilesClaimed++;
              }
            }

            // Lose action if moving into enemy territory or chopping a tree
            if (isEnemyTerritory || wasTree) {
              newState.map[key].hasMoved = true;
            }

            // Clear capital flag if we overwrote a town
            if (wasTown && isEnemyTerritory) {
              newState.map[key].isCapital = false;
            }

            newState.map[selectedHex].unit = null;
          }
          const finalState = updateTerritories(newState, state);
          updateGameState(finalState);
          stateRef.current = finalState;
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
    setHighlightedHexes(new Set());
  };

  if (!state || !currentPlayer) return <div>Loading...</div>;

  return (
    <div className="flex h-screen bg-[#0f172a] text-white overflow-hidden" style={{ 
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='20' viewBox='0 0 100 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M21.184 20c.302-1.364.873-2.73 1.72-4.012 1.166-1.766 2.673-3.02 4.26-3.9 1.495-.828 3.114-1.366 4.79-1.666 2.05-.366 4.078-.366 6.128 0 1.676.3 3.295.838 4.79 1.666 1.587.88 3.094 2.134 4.26 3.9.847 1.282 1.418 2.648 1.72 4.012h1.496c-.28-1.46-.86-2.894-1.715-4.186-1.22-1.846-2.802-3.16-4.466-4.082-1.56-.866-3.245-1.428-4.99-1.74-2.13-.38-4.24-.38-6.37 0-1.745.312-3.43.874-4.99 1.74-1.664.922-3.246 2.236-4.466 4.082-.855 1.292-1.435 2.726-1.715 4.186h1.496z' fill='%231e3a8a' fill-opacity='0.4' fill-rule='evenodd'/%3E%3C/svg%3E")`,
      backgroundSize: '100px 20px'
    }}>
      <div className="flex-1 relative">
        <HexGrid 
          map={state.map} 
          players={state.players}
          onHexClick={handleHexClick}
          onHexRightClick={handleHexRightClick}
          selectedHex={selectedHex || undefined}
          highlightedHexes={highlightedHexes}
          hoveredTerritory={hoveredTerritory}
          territoriesWithActions={territoriesWithActions}
          onHexHover={handleHexHover}
        />
        {/* Dynamic View Window */}
        {hoveredTerritory.size > 0 && (
          <div className="absolute top-4 right-4 z-40 w-64 bg-slate-900/90 backdrop-blur-md border border-slate-700 p-4 rounded-xl shadow-2xl pointer-events-none">
            {(() => {
              const territoryArray = Array.from(hoveredTerritory) as string[];
              const firstHex = state.map[territoryArray[0]];
              const owner = state.players.find(p => p.id === firstHex.ownerId);
              const capitalKey = territoryArray.find(k => state.map[k].isCapital);
              const capital = capitalKey ? state.map[capitalKey] : null;
              const gold = capital?.gold || 0;
              const income = calculateIncome(territoryArray, state.map);
              const upkeep = calculateUpkeep(territoryArray, state.map);
              const net = income - upkeep;
              const isNegative = net < 0;

              return (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: owner?.color }} />
                    <span className="font-bold text-slate-200">{owner?.name || 'Unknown'}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Treasury</div>
                      <div className="flex items-center gap-1 text-yellow-400 font-mono">
                        <Coins size={14} />
                        <span>{gold}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Size</div>
                      <div className="text-slate-300 font-mono">{hoveredTerritory.size} hexes</div>
                    </div>
                  </div>

                  <div className="border-t border-slate-700/50 pt-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Net Income</span>
                      <span className={`font-mono font-bold ${isNegative ? 'text-red-400' : 'text-green-400'}`}>
                        {isNegative ? '' : '+'}{net}/turn
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>+{income} in</span>
                      <span>-{upkeep} out</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Bottom Right Controls */}
        <div className="absolute bottom-6 right-6 z-40 flex items-center gap-4">
          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <motion.button 
                onMouseEnter={() => setIsSurrenderHovered(true)}
                onMouseLeave={() => setIsSurrenderHovered(false)}
                onClick={() => setShowSurrenderConfirm(!showSurrenderConfirm)}
                className="h-[46px] bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-xl hover:bg-slate-800 transition-colors shadow-2xl text-slate-400 hover:text-white flex items-center overflow-hidden"
                animate={{ width: isSurrenderHovered || showSurrenderConfirm ? 140 : 46 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                <div className="w-[46px] flex items-center justify-center shrink-0">
                  <Flag size={20} />
                </div>
                <motion.span 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isSurrenderHovered || showSurrenderConfirm ? 1 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="font-medium whitespace-nowrap pr-4"
                >
                  Surrender?
                </motion.span>
              </motion.button>
              
              {showSurrenderConfirm && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="absolute bottom-full right-0 mb-2 flex flex-col gap-2 w-full"
                >
                  <button 
                    onClick={() => {
                      setShowSurrenderConfirm(false);
                      setState(null);
                      setGameId(null);
                    }}
                    className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold shadow-lg transition-colors"
                  >
                    Yes
                  </button>
                  <button 
                    onClick={() => setShowSurrenderConfirm(false)}
                    className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold shadow-lg transition-colors"
                  >
                    No
                  </button>
                </motion.div>
              )}
            </div>
            <div className="relative group">
              <button className="p-3 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-xl hover:bg-slate-800 transition-colors shadow-2xl text-slate-400 hover:text-white">
                <HelpCircle size={20} />
              </button>
              <div className="absolute bottom-full right-0 mb-4 w-80 bg-slate-900/95 backdrop-blur-md border border-slate-700 p-6 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                  <Swords size={16} className="text-blue-400" />
                  How to Play
                </h3>
                <ul className="text-sm text-slate-300 space-y-2 list-disc pl-4">
                  <li>Expand territory to increase income.</li>
                  <li>Right-click your empty hexes to buy Peasants or Towers.</li>
                  <li>Merge units to upgrade them.</li>
                  <li>Higher tier units can capture better defended hexes.</li>
                  <li>Towers defend your territory.</li>
                  <li>If upkeep exceeds gold, your units will starve and turn into graves!</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Current Turn Indicator */}
          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: currentPlayer.color }} />
              <span className="font-bold text-slate-200">{currentPlayer.name}'s Turn</span>
              {isAIProcessing && (
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                >
                  <RotateCcw size={16} className="text-blue-400" />
                </motion.div>
              )}
            </div>
          </div>
          
          {/* End Turn Button */}
          <button
            onClick={nextTurn}
            disabled={isAIProcessing || (user && currentPlayer.id !== user.uid)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 px-8 py-4 rounded-xl font-bold transition-colors shadow-2xl"
          >
            {isAIProcessing ? 'AI Thinking...' : 'End Turn'}
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Radial Menu */}
        {radialMenu && (
          <div 
            className="fixed z-50 pointer-events-none"
            style={{ left: radialMenu.x, top: radialMenu.y }}
          >
            <div className="relative pointer-events-auto">
              {/* Close background clicker */}
              <div 
                className="fixed inset-0" 
                onClick={() => setRadialMenu(null)}
                onContextMenu={(e) => { e.preventDefault(); setRadialMenu(null); }}
              />
              
              <div className="absolute -translate-x-1/2 -translate-y-1/2">
                <div className="relative w-48 h-48">
                  {(['Peasant', 'Tower'] as UnitType[]).map((type, i) => {
                    const angle = (i * Math.PI) - Math.PI / 2; // Top and Bottom
                    const radius = 60;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;
                    const stats = UNIT_STATS[type as keyof typeof UNIT_STATS];
                    
                    // Check if can afford
                    const territory = getTerritories(state.map, currentPlayer.id).find(t => t.includes(radialMenu.hexKey));
                    const capitalKey = territory?.find(k => state.map[k].isCapital);
                    const gold = capitalKey ? (state.map[capitalKey].gold || 0) : 0;
                    const canAfford = gold >= stats.cost;

                    return (
                      <motion.button
                        key={type}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        disabled={!canAfford}
                        onClick={() => buyUnit(type, radialMenu.hexKey)}
                        className={`absolute w-16 h-16 -ml-8 -mt-8 rounded-full flex flex-col items-center justify-center gap-1 shadow-xl border-2 transition-transform hover:scale-110 ${
                          canAfford 
                            ? 'bg-slate-800 border-blue-500 text-slate-200 hover:bg-slate-700' 
                            : 'bg-slate-900 border-slate-700 text-slate-500 opacity-50 cursor-not-allowed'
                        }`}
                        style={{ left: '50%', top: '50%', x, y }}
                      >
                        {type === 'Peasant' && <User size={20} />}
                        {type === 'Tower' && <Castle size={20} />}
                        <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-yellow-400">
                          <Coins size={10} />
                          {stats.cost}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        <HexGrid 
          map={state.map} 
          players={state.players} 
          onHexClick={handleHexClick} 
          onHexRightClick={handleHexRightClick}
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

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        initialMode={authModalMode} 
      />
      
      <StatsModal 
        isOpen={isStatsModalOpen} 
        onClose={() => setIsStatsModalOpen(false)} 
      />

      <LobbyBrowser
        isOpen={isLobbyBrowserOpen}
        onClose={() => setIsLobbyBrowserOpen(false)}
        onJoinGame={joinGame}
      />
    </div>
  );
};
