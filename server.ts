import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { initDatabase } from './src/server/db.ts';
import { createApiRouter } from './src/server/routes.ts';
import { runMaturityCheck } from './src/server/maturityService.ts';

async function startServer() {
  initDatabase();
  // Execute initial maturity check on startup and schedule hourly checks
  runMaturityCheck();
  setInterval(() => {
    try {
      runMaturityCheck();
    } catch (err) {
      console.error('Maturity check error:', err);
    }
  }, 60 * 60 * 1000);

  const app = express();
  app.set('trust proxy', 1);
  const PORT = 3000;

  // Security headers (iframe-compatible)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '5mb' }));
  app.use('/api', createApiRouter());

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`InvestMarket server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start InvestMarket server:', err);
  process.exit(1);
});
