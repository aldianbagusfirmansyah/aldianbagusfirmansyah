import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Trophy, Play, RotateCcw, Ghost as GhostIcon, Coins } from "lucide-react";
import { MAZE, TILE_SIZE, GHOST_COLORS, POWER_PELLET_DURATION } from "./constants";

type Entity = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
};

type Ghost = Entity & {
  color: string;
  isVulnerable: boolean;
  spawnX: number;
  spawnY: number;
};

type HighScore = {
  name: string;
  score: number;
  date: string;
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover">("menu");
  const [mazeData, setMazeData] = useState<number[][]>([]);
  const [powerUpActive, setPowerUpActive] = useState(false);
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  const [playerName, setPlayerName] = useState("");

  const heroRef = useRef<Entity & { bufferDx: number; bufferDy: number }>({ 
    x: 0, y: 0, dx: 0, dy: 0, speed: 2, bufferDx: 0, bufferDy: 0 
  });
  const ghostsRef = useRef<Ghost[]>([]);
  const requestRef = useRef<number>(null);
  const powerUpTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchHighScores = async () => {
    try {
      const res = await fetch("/api/high-scores");
      const data = await res.json();
      setHighScores(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to fetch high scores");
    }
  };

  useEffect(() => {
    fetchHighScores();
  }, []);

  const saveHighScore = async () => {
    if (!playerName) return;
    try {
      const res = await fetch("/api/high-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playerName, score }),
      });
      const data = await res.json();
      setHighScores(data);
    } catch (e) {
      console.error("Failed to save high score");
    }
  };

  const mazeRef = useRef<number[][]>([]);
  const scoreRef = useRef(0);
  const powerUpActiveRef = useRef(false);

  const initGame = useCallback(() => {
    const newMaze = MAZE.map((row) => [...row]);
    mazeRef.current = newMaze;
    setMazeData(newMaze);
    scoreRef.current = 0;
    setScore(0);
    powerUpActiveRef.current = false;
    setPowerUpActive(false);

    // Find spawn points
    let heroPos = { x: 9 * TILE_SIZE, y: 15 * TILE_SIZE };
    const ghosts: Ghost[] = [];

    newMaze.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === 5) {
          heroPos = { x: x * TILE_SIZE, y: y * TILE_SIZE };
        } else if (cell === 4) {
          ghosts.push({
            x: x * TILE_SIZE,
            y: y * TILE_SIZE,
            dx: 0,
            dy: 0,
            speed: 1.5,
            color: GHOST_COLORS[ghosts.length % GHOST_COLORS.length],
            isVulnerable: false,
            spawnX: x * TILE_SIZE,
            spawnY: y * TILE_SIZE,
          });
        }
      });
    });

    heroRef.current = { ...heroPos, dx: 0, dy: 0, speed: 2, bufferDx: 0, bufferDy: 0 };
    ghostsRef.current = ghosts;
    setGameState("playing");
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const hero = heroRef.current;

    if (key === "arrowup" || key === "w") {
      hero.bufferDx = 0;
      hero.bufferDy = -hero.speed;
    } else if (key === "arrowdown" || key === "s") {
      hero.bufferDx = 0;
      hero.bufferDy = hero.speed;
    } else if (key === "arrowleft" || key === "a") {
      hero.bufferDx = -hero.speed;
      hero.bufferDy = 0;
    } else if (key === "arrowright" || key === "d") {
      hero.bufferDx = hero.speed;
      hero.bufferDy = 0;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const canMove = (x: number, y: number) => {
    const margin = 1; 
    const left = Math.floor((x + margin) / TILE_SIZE);
    const right = Math.floor((x + TILE_SIZE - margin) / TILE_SIZE);
    const top = Math.floor((y + margin) / TILE_SIZE);
    const bottom = Math.floor((y + TILE_SIZE - margin) / TILE_SIZE);

    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        if (MAZE[r] && MAZE[r][c] === 1) return false;
      }
    }
    return true;
  };

  const update = useCallback(() => {
    if (gameState !== "playing") return;

    const hero = heroRef.current;
    
    // 1. Try to apply buffered input if we are at an intersection
    if (hero.bufferDx !== 0 || hero.bufferDy !== 0) {
      const isAtTileCenter = (hero.x % TILE_SIZE === 0 && hero.y % TILE_SIZE === 0);
      const isReversing = (hero.bufferDx !== 0 && hero.bufferDx === -hero.dx) || (hero.bufferDy !== 0 && hero.bufferDy === -hero.dy);
      
      if (isAtTileCenter || isReversing) {
        if (canMove(hero.x + hero.bufferDx, hero.y + hero.bufferDy)) {
          hero.dx = hero.bufferDx;
          hero.dy = hero.bufferDy;
          hero.bufferDx = 0;
          hero.bufferDy = 0;
        }
      }
    }

    // 2. Movement & Grid Snap
    const nextX = hero.x + hero.dx;
    const nextY = hero.y + hero.dy;

    if (canMove(nextX, nextY)) {
      hero.x = nextX;
      hero.y = nextY;
    } else {
      // Hit a wall, stop moving
      hero.dx = 0;
      hero.dy = 0;
    }

    // Collectibles
    const centerX = hero.x + TILE_SIZE / 2;
    const centerY = hero.y + TILE_SIZE / 2;
    const col = Math.floor(centerX / TILE_SIZE);
    const row = Math.floor(centerY / TILE_SIZE);

    if (mazeRef.current[row] && mazeRef.current[row][col] === 2) {
      mazeRef.current[row][col] = 0;
      scoreRef.current += 10;
      setScore(scoreRef.current);
      setMazeData([...mazeRef.current]);
    } else if (mazeRef.current[row] && mazeRef.current[row][col] === 3) {
      mazeRef.current[row][col] = 0;
      scoreRef.current += 50;
      setScore(scoreRef.current);
      setMazeData([...mazeRef.current]);
      activatePowerUp();
    }

    // Update Ghosts
    ghostsRef.current.forEach((ghost, index) => {
      const hero = heroRef.current;
      
      // Target Selection
      let targetX = hero.x;
      let targetY = hero.y;

      if (ghost.isVulnerable) {
        // Flee to corners when vulnerable
        const corners = [
          { x: TILE_SIZE, y: TILE_SIZE },
          { x: (MAZE[0].length - 2) * TILE_SIZE, y: TILE_SIZE },
          { x: TILE_SIZE, y: (MAZE.length - 2) * TILE_SIZE },
          { x: (MAZE[0].length - 2) * TILE_SIZE, y: (MAZE.length - 2) * TILE_SIZE }
        ];
        const corner = corners[index % corners.length];
        targetX = corner.x;
        targetY = corner.y;
      } else {
        // Unique personalities
        if (index === 1) { // Ambush ghost (Pink)
          targetX = hero.x + (hero.dx * 4);
          targetY = hero.y + (hero.dy * 4);
        } else if (index === 2) { // Cautious ghost (Orange)
          const distToHero = Math.hypot(ghost.x - hero.x, ghost.y - hero.y);
          if (distToHero < TILE_SIZE * 8) {
            targetX = TILE_SIZE;
            targetY = (MAZE.length - 2) * TILE_SIZE;
          }
        }
      }

      // Only change direction when at the center of a tile
      const isAtTileCenter = (Math.abs(ghost.x % TILE_SIZE) < 0.1 && Math.abs(ghost.y % TILE_SIZE) < 0.1);

      if ((ghost.dx === 0 && ghost.dy === 0) || isAtTileCenter) {
        // Snap to center
        ghost.x = Math.round(ghost.x / TILE_SIZE) * TILE_SIZE;
        ghost.y = Math.round(ghost.y / TILE_SIZE) * TILE_SIZE;
        
        const directions = [
          { dx: ghost.speed, dy: 0 },
          { dx: -ghost.speed, dy: 0 },
          { dx: 0, dy: ghost.speed },
          { dx: 0, dy: -ghost.speed },
        ];

        // Prevent 180 degree turns unless necessary
        const allowed = directions.filter(d => {
          if (ghost.dx !== 0 && d.dx === -ghost.dx) return false;
          if (ghost.dy !== 0 && d.dy === -ghost.dy) return false;
          return canMove(ghost.x + d.dx, ghost.y + d.dy);
        });

        const valid = allowed.length > 0 ? allowed : directions.filter(d => canMove(ghost.x + d.dx, ghost.y + d.dy));

        if (valid.length > 0) {
          // If vulnerable, we want to MAXIMIZE distance to target (which is hero)
          // If not vulnerable, we want to MINIMIZE distance to target
          valid.sort((a, b) => {
            const distA = Math.hypot((ghost.x + a.dx) - targetX, (ghost.y + a.dy) - targetY);
            const distB = Math.hypot((ghost.x + b.dx) - targetX, (ghost.y + b.dy) - targetY);
            return ghost.isVulnerable ? distB - distA : distA - distB;
          });

          // Add some randomness (10% of the time pick a random valid move)
          const move = Math.random() < 0.1 ? valid[Math.floor(Math.random() * valid.length)] : valid[0];
          ghost.dx = move.dx;
          ghost.dy = move.dy;
        }
      }

      ghost.x += ghost.dx;
      ghost.y += ghost.dy;

      // Collision with Hero
      const dist = Math.hypot(ghost.x - hero.x, ghost.y - hero.y);
      if (dist < TILE_SIZE - 4) {
        if (ghost.isVulnerable) {
          ghost.x = ghost.spawnX;
          ghost.y = ghost.spawnY;
          ghost.isVulnerable = false;
          scoreRef.current += 200;
          setScore(scoreRef.current);
        } else {
          setGameState("gameover");
        }
      }
    });

    draw();
    requestRef.current = requestAnimationFrame(update);
  }, [gameState]);

  const activatePowerUp = () => {
    powerUpActiveRef.current = true;
    setPowerUpActive(true);
    ghostsRef.current.forEach((g) => (g.isVulnerable = true));
    if (powerUpTimerRef.current) clearTimeout(powerUpTimerRef.current);
    powerUpTimerRef.current = setTimeout(() => {
      powerUpActiveRef.current = false;
      setPowerUpActive(false);
      ghostsRef.current.forEach((g) => (g.isVulnerable = false));
    }, POWER_PELLET_DURATION);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Maze
    mazeRef.current.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        const x = colIndex * TILE_SIZE;
        const y = rowIndex * TILE_SIZE;

        if (cell === 1) {
          ctx.fillStyle = "#2563eb";
          ctx.shadowBlur = 15;
          ctx.shadowColor = "rgba(37, 99, 237, 0.6)";
          
          // Draw rounded rectangle for walls
          const r = 4;
          ctx.beginPath();
          ctx.moveTo(x + r + 2, y + 2);
          ctx.lineTo(x + TILE_SIZE - r - 2, y + 2);
          ctx.quadraticCurveTo(x + TILE_SIZE - 2, y + 2, x + TILE_SIZE - 2, y + r + 2);
          ctx.lineTo(x + TILE_SIZE - 2, y + TILE_SIZE - r - 2);
          ctx.quadraticCurveTo(x + TILE_SIZE - 2, y + TILE_SIZE - 2, x + TILE_SIZE - r - 2, y + TILE_SIZE - 2);
          ctx.lineTo(x + r + 2, y + TILE_SIZE - 2);
          ctx.quadraticCurveTo(x + 2, y + TILE_SIZE - 2, x + 2, y + TILE_SIZE - r - 2);
          ctx.lineTo(x + 2, y + r + 2);
          ctx.quadraticCurveTo(x + 2, y + 2, x + r + 2, y + 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (cell === 2) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          ctx.beginPath();
          ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell === 3) {
          ctx.fillStyle = "#fff";
          ctx.shadowBlur = 15;
          ctx.shadowColor = "#fff";
          ctx.beginPath();
          ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });
    });

    // Draw Hero
    const hero = heroRef.current;
    ctx.fillStyle = "#facc15";
    ctx.shadowBlur = 20;
    ctx.shadowColor = "rgba(250, 204, 21, 0.8)";
    ctx.beginPath();
    ctx.arc(hero.x + TILE_SIZE / 2, hero.y + TILE_SIZE / 2, TILE_SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw Ghosts
    ghostsRef.current.forEach((ghost) => {
      ctx.fillStyle = ghost.isVulnerable ? "#3b82f6" : ghost.color;
      ctx.shadowBlur = ghost.isVulnerable ? 15 : 5;
      ctx.shadowColor = ctx.fillStyle as string;
      
      const gx = ghost.x + TILE_SIZE / 2;
      const gy = ghost.y + TILE_SIZE / 2;
      const r = TILE_SIZE / 2 - 2;

      ctx.beginPath();
      ctx.arc(gx, gy, r, Math.PI, 0);
      ctx.lineTo(gx + r, gy + r);
      ctx.lineTo(gx + r / 2, gy + r / 2);
      ctx.lineTo(gx, gy + r);
      ctx.lineTo(gx - r / 2, gy + r / 2);
      ctx.lineTo(gx - r, gy + r);
      ctx.fill();

      // Eyes
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(gx - 3, gy - 2, 2, 0, Math.PI * 2);
      ctx.arc(gx + 3, gy - 2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  };

  useEffect(() => {
    if (gameState === "playing") {
      requestRef.current = requestAnimationFrame(update);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, mazeData]);

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans overflow-hidden">
      {/* Header / HUD Layer */}
      <div className="flex justify-between items-center px-16 py-8 border-b border-blue-900/30 bg-[#0a0a0a]">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.2em] text-blue-400 font-bold mb-1">Current Score</span>
          <span className="text-4xl font-mono tracking-tighter">{score.toLocaleString().padStart(7, "0")}</span>
        </div>
        
        <div className="flex items-center gap-12">
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-[0.2em] text-blue-400 font-bold mb-2">Status</span>
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${powerUpActive ? "bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.8)]" : "bg-green-500"}`}></div>
              <span className={`text-xs font-bold tracking-wider uppercase ${powerUpActive ? "text-cyan-400" : "text-green-500"}`}>
                {powerUpActive ? "Vulnerable Active" : "Active Mode"}
              </span>
            </div>
          </div>
          
          <div className="w-[2px] h-12 bg-blue-900/40"></div>
          
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-[0.2em] text-blue-400 font-bold mb-1">High Score</span>
            <span className="text-2xl font-mono text-white/50 tracking-tighter">
              {(highScores[0]?.score || 0).toLocaleString().padStart(7, "0")}
            </span>
          </div>
        </div>
      </div>

      {/* Main Game Stage */}
      <div className="flex-1 flex items-center justify-center p-8 gap-8 overflow-hidden">
        {/* Sidebar Left: Level Info */}
        <div className="w-56 flex flex-col gap-6">
          <div className="p-5 border border-blue-900/50 rounded-xl bg-blue-950/10 backdrop-blur-sm">
            <h3 className="text-[11px] font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <GhostIcon className="w-3 h-3" />
              Containment List
            </h3>
            <div className="flex flex-wrap gap-3">
              {GHOST_COLORS.map((color, i) => (
                <div key={i} className="w-8 h-8 rounded flex items-center justify-center border border-white/10 bg-white/5 overflow-hidden">
                   <div style={{ backgroundColor: color }} className="w-3 h-3 rounded-full blur-[1px]"></div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-5 border border-white/5 rounded-xl bg-white/5">
            <span className="text-[10px] text-white/40 uppercase tracking-widest block mb-4">Hall of Wraiths</span>
            <div className="space-y-3">
              {highScores.slice(0, 5).map((hs, i) => (
                <div key={i} className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-white/60">{hs.name || "Anon"}</span>
                  <span className="text-blue-400">{hs.score.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* The Maze Container */}
        <div className="relative group">
          <div className="relative bg-black border-[6px] border-blue-600 rounded-2xl shadow-[0_0_50px_rgba(37,99,235,0.15)] p-4">
            <canvas
              ref={canvasRef}
              width={19 * TILE_SIZE}
              height={19 * TILE_SIZE}
              className="block"
            />

            <AnimatePresence>
              {gameState !== "playing" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-[#050505]/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center rounded-lg"
                >
                  {gameState === "menu" ? (
                    <>
                      <div className="mb-10 relative">
                        <motion.div 
                          animate={{ rotate: 360 }} 
                          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                          className="absolute -inset-16 border border-blue-500/10 rounded-full scale-110"
                        />
                        <h1 className="text-5xl font-black tracking-tighter text-white italic relative flex flex-col items-center">
                          <span className="text-blue-400 text-xs tracking-[0.5em] font-bold not-italic mb-2 opacity-50 uppercase">Protocol: Beta-9</span>
                          NEON WRAITH
                        </h1>
                      </div>
                      
                      <button
                        onClick={initGame}
                        className="group relative px-12 py-4 bg-white text-black hover:bg-blue-400 hover:text-white rounded-full transition-all duration-300 font-black tracking-widest text-xs flex items-center gap-3 overflow-hidden"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        INITIALIZE SEQUENCE
                        <div className="absolute inset-0 bg-blue-400 translate-y-full group-hover:translate-y-0 transition-transform -z-10" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="mb-10">
                        <h2 className="text-4xl font-black text-white mb-2 tracking-tighter italic">CORE TERMINATED</h2>
                        <div className="w-12 h-1 bg-red-500 mx-auto rounded-full"></div>
                      </div>
                      
                      <div className="text-5xl font-mono mb-12 text-blue-400 tracking-tighter">
                        {score.toLocaleString()}
                      </div>
                      
                      <div className="flex flex-col gap-4 w-full max-w-xs">
                        <input
                          type="text"
                          maxLength={10}
                          placeholder="OPERATOR ID"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 focus:border-blue-500 outline-none uppercase text-center tracking-widest font-mono text-sm transition-all"
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value)}
                        />
                        <button
                          onClick={() => {
                            saveHighScore();
                            setGameState("menu");
                          }}
                          className="w-full px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl transition-all flex items-center justify-center gap-2 font-bold uppercase tracking-widest text-[11px] shadow-lg shadow-blue-900/20"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Restart Sequence
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Sidebar Right: Controls */}
        <div className="w-56 flex flex-col items-end gap-10">
          <div className="text-right">
            <h3 className="text-[11px] font-bold text-blue-400 uppercase tracking-widest mb-6">Navigation</h3>
            <div className="grid grid-cols-3 gap-2 w-28 ml-auto">
              <div></div>
              <div className="w-9 h-9 rounded-lg border border-white/20 flex items-center justify-center bg-white/5 text-[10px] font-bold">W</div>
              <div></div>
              <div className="w-9 h-9 rounded-lg border border-white/20 flex items-center justify-center bg-white/5 text-[10px] font-bold">A</div>
              <div className="w-9 h-9 rounded-lg border border-white/20 flex items-center justify-center bg-white/5 text-[10px] font-bold">S</div>
              <div className="w-9 h-9 rounded-lg border border-white/20 flex items-center justify-center bg-white/5 text-[10px] font-bold">D</div>
            </div>
            <p className="text-[10px] text-white/30 mt-6 leading-relaxed tracking-wide font-medium">Use ARROWS or WASD keys to navigate the secure sector.</p>
          </div>

          <div className="w-full h-px bg-blue-900/30"></div>

          <div className="text-right w-full">
            <span className="text-[10px] uppercase tracking-widest text-blue-400 block mb-3 font-bold opacity-70">Core Vulnerability</span>
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-2 border border-white/5">
              <motion.div 
                initial={{ width: "0%" }}
                animate={{ width: powerUpActive ? "100%" : "0%" }}
                transition={{ duration: powerUpActive ? POWER_PELLET_DURATION / 1000 : 0.5, ease: "linear" }}
                className="h-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]"
              />
            </div>
            <span className="text-[9px] text-white/25 uppercase mt-3 inline-block font-mono">
              {powerUpActive ? "Overdrive Protocol Engaged" : "Standard Sweep Active"}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Bar */}
      <div className="h-20 flex items-center justify-center border-t border-blue-900/30 bg-[#0a0a0a] px-12">
        <div className="flex gap-10 items-center text-[10px] font-bold uppercase tracking-[0.4em] text-white/20">
          <span className="hover:text-blue-400 cursor-pointer transition-colors duration-300">System Logs</span>
          <span className="w-1 h-1 bg-white/10 rounded-full"></span>
          <span className="hover:text-blue-400 cursor-pointer transition-colors duration-300 font-mono">Ver: 0.14.82</span>
          <span className="w-1 h-1 bg-white/10 rounded-full"></span>
          <span className="hover:text-blue-400 cursor-pointer transition-colors duration-300">Terminate</span>
        </div>
      </div>
    </div>
  );
}
