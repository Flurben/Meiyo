import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import https from "https";
import fs from "fs";


async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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

  https.createServer(
  {
    key: fs.readFileSync('./letsencrypt-meiyo/privkey.pem'),
    cert: fs.readFileSync('./letsencrypt-meiyo/cert.pem'),
  },
  app
  ).listen(3000, () => {
    console.log('Listen on https://localhost:3000')
  });
}

startServer();
