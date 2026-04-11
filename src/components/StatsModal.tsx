import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trophy, Swords, Coins, Hexagon } from 'lucide-react';
import { useAuth } from '../AuthProvider';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  userName?: string;
}

export const StatsModal: React.FC<StatsModalProps> = ({ isOpen, onClose, userId, userName }) => {
  const { user, userData } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const targetUserId = userId || user?.uid;
  const targetUserName = userName || userData?.alias || user?.displayName || 'Player';

  useEffect(() => {
    if (isOpen && targetUserId) {
      setLoading(true);
      const fetchStats = async () => {
        try {
          const res = await fetch(`/api/users/${targetUserId}`);
          if (res.ok) {
            const data = await res.json();
            setStats(data.stats);
          }
        } catch (error) {
          console.error("Error fetching stats:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchStats();
    }
  }, [isOpen, targetUserId]);

  if (!isOpen) return null;

  const winRatio = stats?.gamesPlayed > 0 
    ? Math.round((stats.wins / stats.gamesPlayed) * 100) 
    : 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative"
        >
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>

          <div className="p-8">
            <h2 className="text-2xl font-black text-white mb-6 text-center flex items-center justify-center gap-3">
              <Trophy className="text-yellow-400" />
              {targetUserName}'s Statistics
            </h2>

            {loading ? (
              <div className="text-center text-slate-400 py-8">Loading stats...</div>
            ) : stats ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center">
                    <div className="text-3xl font-black text-white mb-1">{stats.wins}</div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Wins</div>
                  </div>
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center">
                    <div className="text-3xl font-black text-white mb-1">{stats.losses}</div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Losses</div>
                  </div>
                </div>

                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Win Ratio</span>
                    <span className="text-lg font-black text-white">{winRatio}%</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full" 
                      style={{ width: `${winRatio}%` }}
                    />
                  </div>
                  <div className="text-center text-xs text-slate-500 mt-2">
                    {stats.gamesPlayed} Total Games Played
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <Coins size={18} className="text-yellow-400" />
                      <span className="text-sm text-slate-300">Total Gold Earned</span>
                    </div>
                    <span className="font-mono text-white">{stats.totalGoldEarned}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <Coins size={18} className="text-slate-400" />
                      <span className="text-sm text-slate-300">Total Gold Spent</span>
                    </div>
                    <span className="font-mono text-white">{stats.totalGoldSpent}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <Hexagon size={18} className="text-blue-400" />
                      <span className="text-sm text-slate-300">Total Tiles Claimed</span>
                    </div>
                    <span className="font-mono text-white">{stats.totalTilesClaimed}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400 py-8">No stats available yet.</div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
