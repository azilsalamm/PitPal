import { Router } from 'express';
import { buildEstimate, EstimateInput } from '../adapters/estimate.js';
import { reviewGarages, ReviewInput } from '../adapters/review.js';
import { errProvider } from './places.js';
import { rateLimit } from '../lib/rateLimit.js';

export const estimateRouter = Router();
estimateRouter.use(rateLimit('estimate', 30));

/** Indicative estimate for a job on a specific car at a specific garage (Gemini + garage website facts). */
estimateRouter.post('/', async (req, res) => {
  const parsed = EstimateInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid estimate request' } });
    return;
  }
  try {
    res.json(await buildEstimate(parsed.data));
  } catch (e) {
    errProvider(res, e);
  }
});

/** Short AI review per garage: why it suits (or not) this car and job, from listed facts only. */
estimateRouter.post('/reviews', async (req, res) => {
  const parsed = ReviewInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid review request' } });
    return;
  }
  try {
    res.json({ reviews: await reviewGarages(parsed.data), generatedAt: new Date().toISOString() });
  } catch (e) {
    errProvider(res, e);
  }
});
