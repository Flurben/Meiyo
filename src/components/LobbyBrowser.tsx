import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, Play } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { GameState } from '../game/types';

interface LobbyBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinGame: (gameId: string) => void;
}

interface GameLobby {
  id: string;
  hostName: string;
  playersCount: number;
}

export const LobbyBrowser: React.FC<LobbyBrowserProps> = ({ isOpen, onClose, onJoinGame }) => {
  const [lobbies, setLobbies] = useState<GameLobby[]>([]);

  useEffect(() => {
    if (isOpen) {
      const q = query(collection(db, 'games'), where('status', '==', 'lobby'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const availableLobbies = snapshot.docs.map(doc => {
          const data = doc.data() as GameState;
          return {
            id: doc.id,
            hostName: data.players[0]?.name || 'Unknown',
            playersCount: data.players.length
          };
        });
        setLobbies(availableLobbies);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'games');
      });

      return () => unsubscribe();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-slate-900 p-8 rounded-3xl max-w-2xl w-full border border-slate-800 shadow-2xl relative"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <h2 className="text-3xl font-black text-white mb-6">Available Games</h2>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          {lobbies.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p className="text-lg font-medium">No games available.</p>
              <p className="text-sm">Why not host one yourself?</p>
            </div>
          ) : (
            lobbies.map(lobby => (
              <div 
                key={lobby.id}
                className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center justify-between hover:border-slate-600 transition-colors"
              >
                <div>
                  <h3 className="text-lg font-bold text-white">{lobby.hostName}'s Game</h3>
                  <div className="flex items-center gap-2 text-slate-400 text-sm mt-1">
                    <Users size={14} />
                    <span>{lobby.playersCount} Players</span>
                  </div>
                </div>
                <button
                  onClick={() => onJoinGame(lobby.id)}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-lg font-bold text-white transition-colors"
                >
                  <Play size={16} />
                  Join
                </button>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
};
