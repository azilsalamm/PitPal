import { Router } from 'express';
import { z } from 'zod';
import { identifyVehicle } from '../adapters/gemini.js';
import { ProviderError } from '../adapters/geoapify.js';
import { rateLimit } from '../lib/rateLimit.js';

export const visionRouter = Router();
visionRouter.use(rateLimit('vision', 20));

const Body = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
  requestToken: z.string().optional(),
});

export function sniffMime(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png';
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
    return 'image/webp';
  return null;
}

visionRouter.post('/identify', async (req, res) => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid request body' } });
    return;
  }
  const { imageBase64, requestToken } = parsed.data;

  let bytes: Buffer;
  try {
    bytes = Buffer.from(imageBase64, 'base64');
  } catch {
    res.status(415).json({ error: { code: 'UNSUPPORTED_FILE', message: 'That file is not a readable image.' } });
    return;
  }
  if (bytes.length > 4 * 1024 * 1024) {
    res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'The photo is too large even after resizing.' } });
    return;
  }
  const mime = sniffMime(bytes);
  if (!mime || (parsed.data.mimeType && parsed.data.mimeType !== mime)) {
    res.status(415).json({ error: { code: 'UNSUPPORTED_FILE', message: 'Use a JPEG, PNG or WebP photo.' } });
    return;
  }

  try {
    const result = await identifyVehicle(imageBase64, mime);
    res.json({ requestToken: requestToken ?? null, result });
  } catch (e) {
    if (e instanceof ProviderError) {
      res.status(e.status).json({ error: { code: e.code, message: e.message } });
      return;
    }
    res.status(502).json({ error: { code: 'PROVIDER_ERROR', message: 'Identification failed.' } });
  }
});
