import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";
import { getUser, saveUser, getGame, getGameByJoinCode, saveGame } from "./src/server/db.js";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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
      io.to(gameState.id).emit("gameState", gameState);
    });

    socket.on("getGameByCode", (joinCode, callback) => {
      const game = getGameByJoinCode(joinCode);
      callback(game);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
