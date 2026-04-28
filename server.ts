import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HIGH_SCORES_FILE = path.join(__dirname, "highscores.json");

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // High Scores API
  app.get("/api/high-scores", async (req, res) => {
    try {
      const data = await fs.readFile(HIGH_SCORES_FILE, "utf-8");
      res.json(JSON.parse(data));
    } catch (error) {
      res.json([]);
    }
  });

  app.post("/api/high-scores", async (req, res) => {
    try {
      const { name, score } = req.body;
      let scores = [];
      try {
        const data = await fs.readFile(HIGH_SCORES_FILE, "utf-8");
        scores = JSON.parse(data);
      } catch (e) {
        // file doesn't exist yet
      }

      scores.push({ name, score, date: new Date().toISOString() });
      scores.sort((a: any, b: any) => b.score - a.score);
      scores = scores.slice(0, 10); // Keep top 10

      await fs.writeFile(HIGH_SCORES_FILE, JSON.stringify(scores, null, 2));
      res.json(scores);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save score" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
