import { Router } from 'express';
import type { IntegrationStatus } from '@pitpal/shared';
import {
  getContextDevKey,
  getGeminiKey,
  getGeoapifyKey,
} from '../config.js';
import { lastError } from '../lib/lastError.js';

export const statusRouter = Router();

function row(
  name: IntegrationStatus['name'],
  configured: boolean,
  configuredDetail: string,
  missingDetail: string,
  checkedAt: string,
): IntegrationStatus {
  const prev = lastError(name);
  const detail =
    configured && prev && prev !== 'NOT_CONFIGURED'
      ? `${configuredDetail} Last error: ${prev}.`
      : configured
        ? configuredDetail
        : missingDetail;
  return {
    name,
    state: configured ? (prev && prev !== 'NOT_CONFIGURED' ? 'failed' : 'configured') : 'unavailable',
    detail,
    checkedAt,
  };
}

statusRouter.get('/integrations', (_req, res) => {
  const checkedAt = new Date().toISOString();
  res.json({
    integrations: [
      row(
        'geoapify',
        !!getGeoapifyKey(),
        'Live garage discovery is configured.',
        'Not configured — live garage discovery is unavailable in this environment.',
        checkedAt,
      ),
      row(
        'gemini_vision',
        !!getGeminiKey(),
        'Photo-assisted vehicle identification is configured.',
        'Not configured — enter vehicle details manually.',
        checkedAt,
      ),
      row(
        'contextdev',
        !!getContextDevKey(),
        'Garage website enrichment is configured.',
        'Not configured — website enrichment is unavailable.',
        checkedAt,
      ),
    ],
  });
});
