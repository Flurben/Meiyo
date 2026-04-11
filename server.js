import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import fs from "fs";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { getUser, saveUser, getGame, getGameByJoinCode, saveGame, getUserByUsername } from "./src/server/db.js";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  
  const isProduction = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
  console.log("Running in Production: " + isProduction)

  let httpServer;
  if (isProduction) {
    const options = {
      key: fs.readFileSync('./letsencrypt-meiyo/privkey.pem'),
      cert: fs.readFileSync('./letsencrypt-meiyo/cert.pem'),
    };
    httpServer = createHttpsServer(options, app);
  } else {
    httpServer = createHttpServer(app);
  }

  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  app.use(express.json({ limit: '5mb' }));

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/auth/signup", (req, res) => {
    const { username, password, alias } = req.body;
    if (!username || !password || !alias) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    const existingUser = getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: "Username already taken" });
    }

    const id = uuidv4();
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    
    const newUser = {
      id,
      username,
      password: hashedPassword,
      alias,
      photoURL: '',
      stats: {
        wins: 0, losses: 0, gamesPlayed: 0,
        totalGoldSpent: 0, totalGoldEarned: 0, totalTilesClaimed: 0
      }
    };
    
    saveUser(newUser);
    res.json({ id, username, alias, photoURL: newUser.photoURL, stats: newUser.stats });
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const user = getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    if (user.password !== hashedPassword) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    res.json({ id: user.id, username: user.username, alias: user.alias, photoURL: user.photoURL, stats: JSON.parse(user.stats) });
  });

  app.get("/api/users/:id", (req, res) => {
    const user = getUser(req.params.id);
    if (user) res.json(user);
    else res.status(404).json({ error: "User not found" });
  });

  app.post("/api/users", (req, res) => {
    saveUser(req.body);
    res.json({ success: true });
  });

  // Socket.IO for real-time game state
  io.on("connection", (socket) => {
    socket.on("joinGame", (gameId) => {
      socket.join(gameId);
      const game = getGame(gameId);
      if (game) {
        socket.emit("gameState", game);
      }
    });

    socket.on("leaveGame", (gameId) => {
      socket.leave(gameId);
    });

    socket.on("updateGame", (gameState) => {
      saveGame(gameState);
      socket.to(gameState.id).emit("gameState", gameState);
    });

    socket.on("getGameByCode", (joinCode, callback) => {
      const game = getGameByJoinCode(joinCode);
      callback(game);
    });
  });

  // Vite middleware for development or if dist doesn't exist
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(distPath);

  if (!isProduction || !hasDist) {
    if (isProduction && !hasDist) {
      console.warn("WARNING: Running in production mode but 'dist' folder not found. Falling back to Vite middleware (slower). Please run 'npm run build'.");
    }
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    const protocol = isProduction ? "https" : "http";
    console.log(`Server running on ${protocol}://0.0.0.0:${PORT}`);
  });
}

startServer();
