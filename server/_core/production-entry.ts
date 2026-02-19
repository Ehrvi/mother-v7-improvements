/**
 * Production-only entry point for Cloud Run deployment
 * This file NEVER imports vite.ts or any Vite dependencies
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createContext } from './context.js';
import { appRouter } from '../routers.js';
import { registerOAuthRoutes } from './oauth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OAuth routes
registerOAuthRoutes(app);

// tRPC routes
app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Serve static files from Vite build
// Use absolute path in production to avoid esbuild path optimization issues
const distPath = process.env.NODE_ENV === 'production'
  ? '/app/dist/public'  // Absolute path in Docker container
  : path.join(__dirname, '../../public');  // Relative path for local dev

console.log(`📦 Serving static files from: ${distPath}`);
app.use(express.static(distPath));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Production server running on http://0.0.0.0:${PORT}`);
  console.log(`📦 Serving static files from: ${distPath}`);
});
