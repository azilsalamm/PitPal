import { Router } from 'express';
import { z } from 'zod';
import { Emirate } from '@pitpal/shared';
import { searchDirectories } from '../adapters/directories.js';
import { ProviderError } from '../adapters/geoapify.js';
import { rateLimit } from '../lib/rateLimit.js';

export const directoriesRouter = Router();
directoriesRouter.use(rateLimit('directories', 10));

const Body = z.object({
  emirate: Emirate,
  area: z.string().optional(),
});

directoriesRouter.post('/search', (req, res) => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid body' } });
    return;
  }
  try {
    res.json(searchDirectories(parsed.data.emirate, parsed.data.area));
  } catch (e) {
    if (e instanceof ProviderError) {
      res.status(e.status).json({ error: { code: e.code, message: e.message } });
      return;
    }
    res.status(502).json({ error: { code: 'PROVIDER_ERROR', message: 'Directory search failed.' } });
  }
});
