import express from 'express';
import { rateLimit } from './lib/rateLimit.js';
import { statusRouter } from './routes/status.js';
import { placesRouter } from './routes/places.js';
import { visionRouter } from './routes/vision.js';
import { enrichmentRouter } from './routes/enrichment.js';
import { directoriesRouter } from './routes/directories.js';
import { vehiclesRouter } from './routes/vehicles.js';
import { liveRouter } from './routes/live.js';
import { estimateRouter } from './routes/estimate.js';
import { warmDirectories } from './adapters/directories.js';

export const app = express();
const PORT = Number(process.env.PORT ?? 8787);

app.use('/api', rateLimit('api', 120));
app.use('/api/status', statusRouter);
app.use('/api/places', express.json({ limit: '256kb' }), placesRouter);
app.use('/api/vision', express.json({ limit: '6mb' }), visionRouter);
app.use('/api/enrichment', express.json({ limit: '256kb' }), enrichmentRouter);
app.use('/api/directories', express.json({ limit: '256kb' }), directoriesRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/live', express.json({ limit: '256kb' }), liveRouter);
app.use('/api/estimate', express.json({ limit: '64kb' }), estimateRouter);

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
});

// Warm the directory cache in the background; caches are per-instance in
// serverless, and cold starts must not block — warmDirectories() is async,
// fire-and-forget, and tolerant of repeated calls (warmRunning guard).
warmDirectories();
if (process.env.VERCEL !== '1') {
  setInterval(warmDirectories, 24 * 3600_000).unref();
}

// Only listen when run directly (not imported by the serverless entry).
const isMain = process.argv[1] && /server[\\/]src[\\/]index\.|src[\\/]index\.ts$/.test(process.argv[1]);
if (isMain) {
  app.listen(PORT, () => {
    console.log(`PitPal server listening on http://localhost:${PORT}`);
  });
}

export default app;
