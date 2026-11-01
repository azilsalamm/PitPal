import { Router } from 'express';
import { searchDirectories } from '../adapters/directories.js';
import { errProvider, PlacesBody, searchPlaces } from './places.js';
import { rateLimit } from '../lib/rateLimit.js';

export const liveRouter = Router();
liveRouter.use(rateLimit('live', 120));

/**
 * Combined live search: Geoapify places + cached directory listings in one
 * response. Directories never block — places answer as soon as they're back;
 * still-warming sources come back in `directories.pending`.
 */
liveRouter.post('/search', async (req, res) => {
  const parsed = PlacesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid search body' } });
    return;
  }
  try {
    const places = await searchPlaces(parsed.data);
    const placesPayload = (
      'areNotFound' in places ? places.payload : places
    ) as Record<string, unknown>;
    const directories = searchDirectories(parsed.data.emirate, parsed.data.area);
    res.json({ ...placesPayload, directories });
  } catch (e) {
    errProvider(res, e);
  }
});
