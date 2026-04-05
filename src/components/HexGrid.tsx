
import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { HexData, Player, UnitType } from '../game/types';
import { axialToPixel, keyToAxial } from '../game/hex';
import { 
  User, 
  Shield, 
  Sword, 
  Crown, 
  Castle, 
  TreePine, 
  Skull, 
  Home 
} from 'lucide-react';

const HEX_SIZE = 40;

interface HexGridProps {
  map: Record<string, HexData>;
  players: Player[];
  onHexClick: (key: string) => void;
  selectedHex?: string;
  highlightedHexes?: Set<string>;
  hoveredTerritory?: Set<string>;
  onHexHover: (key: string | null) => void;
}

const UnitIcon = ({ type, color, hasMoved }: { type: UnitType; color: string; hasMoved?: boolean }) => {
  const iconProps = { 
    size: 24, 
    className: `text-white drop-shadow-md transition-opacity ${hasMoved ? 'opacity-40' : 'opacity-100'}` 
  };
  
  let icon = null;
  switch (type) {
    case 'Peasant': icon = <User {...iconProps} />; break;
    case 'Spearman': icon = <Sword {...iconProps} />; break;
    case 'Knight': icon = <Shield {...iconProps} />; break;
    case 'Baron': icon = <Crown {...iconProps} />; break;
    case 'Tower': icon = <Castle {...iconProps} />; break;
    case 'Town': icon = <Home {...iconProps} />; break;
    case 'Tree': icon = <TreePine size={24} className="text-green-800" />; break;
    case 'Grave': icon = <Skull size={24} className="text-gray-400" />; break;
  }

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {icon}
    </motion.div>
  );
};

export const HexGrid: React.FC<HexGridProps> = ({ 
  map, 
  players, 
  onHexClick, 
  selectedHex, 
  highlightedHexes,
  hoveredTerritory,
  onHexHover
}) => {
  const hexes = useMemo(() => Object.entries(map), [map]);

  const getPlayerColor = (playerId: string | null) => {
    if (!playerId) return '#e5e7eb'; // gray-200
    return players.find(p => p.id === playerId)?.color || '#e5e7eb';
  };

  const hexPoints = useMemo(() => {
    const points = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      points.push(`${HEX_SIZE * Math.cos(angle)},${HEX_SIZE * Math.sin(angle)}`);
    }
    return points.join(' ');
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full h-full max-w-[1200px] max-h-[800px] relative">
        <svg 
          viewBox="-700 -500 1400 1000" 
          className="w-full h-full drop-shadow-2xl"
          preserveAspectRatio="xMidYMid meet"
        >
          <g>
            {hexes.map(([key, hex]) => {
            const { x, y } = axialToPixel(hex.q, hex.r, HEX_SIZE);
            const isSelected = selectedHex === key;
            const isHighlighted = highlightedHexes?.has(key);
            const isInHoveredTerritory = hoveredTerritory?.has(key);
            const playerColor = getPlayerColor(hex.ownerId);

            return (
              <motion.g
                key={key}
                whileHover={{ scale: 1.05 }}
                onClick={() => onHexClick(key)}
                onMouseEnter={() => onHexHover(key)}
                onMouseLeave={() => onHexHover(null)}
                className="cursor-pointer"
                style={{ x, y }}
              >
                <polygon
                  points={hexPoints}
                  fill={playerColor}
                  stroke={isSelected ? '#fff' : isHighlighted ? '#fbbf24' : isInHoveredTerritory ? '#fff' : '#475569'}
                  strokeWidth={isSelected ? 4 : isHighlighted ? 3 : isInHoveredTerritory ? 2 : 1}
                  className="transition-colors duration-300"
                />
                {hex.unit && (
                  <foreignObject
                    x={-12}
                    y={-12}
                    width={24}
                    height={24}
                    className="pointer-events-none"
                  >
                    <div className="flex items-center justify-center w-full h-full">
                      <UnitIcon type={hex.unit} color={playerColor} hasMoved={hex.hasMoved} />
                    </div>
                  </foreignObject>
                )}
                {hex.isCapital && (
                   <circle r={4} fill="#fff" cy={15} />
                )}
              </motion.g>
            );
          })}
        </g>
      </svg>
      </div>
    </div>
  );
};
