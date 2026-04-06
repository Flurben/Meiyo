
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
  onHexRightClick?: (key: string, e: React.MouseEvent) => void;
  selectedHex?: string;
  highlightedHexes?: Set<string>;
  hoveredTerritory?: Set<string>;
  territoriesWithActions?: Set<string>;
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
    <div className="flex items-center justify-center w-full h-full">
      {icon}
    </div>
  );
};

export const HexGrid: React.FC<HexGridProps> = ({ 
  map, 
  players, 
  onHexClick, 
  onHexRightClick,
  selectedHex, 
  highlightedHexes,
  hoveredTerritory,
  territoriesWithActions,
  onHexHover
}) => {
  const hexes = useMemo(() => Object.entries(map), [map]);

  const getPlayerColor = (playerId: string | null) => {
    if (!playerId) return '#e5e7eb'; // gray-200
    return players.find(p => p.id === playerId)?.color || '#e5e7eb';
  };

  const hexCorners = useMemo(() => {
    const corners = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      corners.push({ x: HEX_SIZE * Math.cos(angle), y: HEX_SIZE * Math.sin(angle) });
    }
    return corners;
  }, []);

  const hexPoints = useMemo(() => {
    return hexCorners.map(p => `${p.x},${p.y}`).join(' ');
  }, [hexCorners]);

  // Edge mapping based on getNeighbors directions
  const edgeIndices = [
    [0, 1], // East
    [5, 0], // North East
    [4, 5], // North West
    [3, 4], // West
    [2, 3], // South West
    [1, 2]  // South East
  ];

  return (
    <div className="relative w-full h-full overflow-hidden flex items-center justify-center p-4">
      <div className="w-full h-full max-w-[1200px] max-h-[800px] relative">
        <svg 
          viewBox="-700 -500 1400 1000" 
          className="w-full h-full drop-shadow-2xl"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <filter id="bloom" x="-20%" y="-20%" width="140%" height="140%">
              <motion.feGaussianBlur 
                stdDeviation="4" 
                result="blur" 
                animate={{ stdDeviation: [3, 6, 3] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g>
            {hexes.map(([key, hex]) => {
              const { x, y } = axialToPixel(hex.q, hex.r, HEX_SIZE);
              const isSelected = selectedHex === key;
              const playerColor = getPlayerColor(hex.ownerId);

              return (
                <motion.g
                  key={`base-${key}`}
                  whileHover={{ scale: 1.05 }}
                  onClick={() => onHexClick(key)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onHexRightClick?.(key, e);
                  }}
                  onMouseEnter={() => onHexHover(key)}
                  onMouseLeave={() => onHexHover(null)}
                  className="cursor-pointer"
                  style={{ x, y }}
                >
                  <polygon
                    points={hexPoints}
                    fill={playerColor}
                    stroke={isSelected ? '#fff' : '#475569'}
                    strokeWidth={isSelected ? 4 : 1}
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
                  {hex.isCapital && territoriesWithActions?.has(key) && (
                     <circle r={4} fill="#fff" cy={15} />
                  )}
                </motion.g>
              );
            })}
          </g>
          <g className="pointer-events-none">
            {/* Hovered Territory Borders */}
            {hoveredTerritory && Array.from(hoveredTerritory).map((key: string) => {
              const hex = map[key];
              if (!hex) return null;
              const { x, y } = axialToPixel(hex.q, hex.r, HEX_SIZE);
              const neighbors = [
                { q: hex.q + 1, r: hex.r },
                { q: hex.q + 1, r: hex.r - 1 },
                { q: hex.q, r: hex.r - 1 },
                { q: hex.q - 1, r: hex.r },
                { q: hex.q - 1, r: hex.r + 1 },
                { q: hex.q, r: hex.r + 1 }
              ];

              return (
                <motion.g key={`hover-border-${key}`} style={{ x, y }}>
                  {neighbors.map((n, i) => {
                    const nKey = `${n.q},${n.r}`;
                    if (!hoveredTerritory.has(nKey)) {
                      const edge = edgeIndices[i];
                      const p1 = hexCorners[edge[0]];
                      const p2 = hexCorners[edge[1]];
                      return (
                        <line
                          key={`edge-${i}`}
                          x1={p1.x} y1={p1.y}
                          x2={p2.x} y2={p2.y}
                          stroke="#fff"
                          strokeWidth={3}
                          className="drop-shadow-md"
                        />
                      );
                    }
                    return null;
                  })}
                </motion.g>
              );
            })}

            {/* Marching Ants Highlight */}
            {hexes.map(([key, hex]) => {
              const { x, y } = axialToPixel(hex.q, hex.r, HEX_SIZE);
              const isHighlighted = highlightedHexes?.has(key);
              const isOutsideHighlight = isHighlighted && selectedHex && hex.ownerId !== map[selectedHex].ownerId;

              if (!isOutsideHighlight) return null;

              return (
                <motion.g
                  key={`highlight-${key}`}
                  style={{ x, y }}
                >
                  <motion.polygon
                    points={hexPoints}
                    fill="none"
                    stroke="#E80600"
                    strokeWidth={4}
                    strokeDasharray="6 6"
                    filter="url(#bloom)"
                    animate={{ 
                      strokeDashoffset: [0, -12]
                    }}
                    transition={{ 
                      strokeDashoffset: { repeat: Infinity, duration: 1, ease: "linear" }
                    }}
                  />
                </motion.g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
};
