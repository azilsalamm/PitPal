import { Router } from 'express';
import { getMakes, getModels } from '../adapters/vehicles.js';
import { rateLimit } from '../lib/rateLimit.js';

export const vehiclesRouter = Router();
vehiclesRouter.use(rateLimit('vehicles', 60));

vehiclesRouter.get('/makes', async (_req, res) => {
  try {
    const r = await getMakes();
    res.json({ makes: r.makes, sources: r.sources });
  } catch {
    res.status(502).json({
      error: { code: 'PROVIDER_ERROR', message: 'Vehicle catalog is unavailable.' },
    });
  }
});

vehiclesRouter.get('/models', async (req, res) => {
  const make = typeof req.query.make === 'string' ? req.query.make.trim() : '';
  if (!make) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'make is required' } });
    return;
  }
  try {
    const r = await getModels(make);
    res.json({ models: r.models, sources: r.sources });
  } catch {
    res.status(502).json({
      error: { code: 'PROVIDER_ERROR', message: 'Vehicle catalog is unavailable.' },
    });
  }
});
