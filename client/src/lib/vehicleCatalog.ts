import { useEffect, useState } from 'react';
import { getJson } from './api';
import { MAKE_NAMES, VEHICLE_MAKES } from '../data/vehicles';

interface MakesRes {
  makes: { name: string }[];
  sources: string[];
}
interface ModelsRes {
  models: { name: string; yearFrom?: number; yearTo?: number }[];
  sources: string[];
}

export function useMakes(): string[] {
  const [makes, setMakes] = useState<string[]>(MAKE_NAMES);
  useEffect(() => {
    let cancelled = false;
    getJson<MakesRes>('/api/vehicles/makes')
      .then((r) => {
        if (!cancelled && r.makes.length) setMakes(r.makes.map((m) => m.name));
      })
      .catch(() => {
        /* keep static list */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return makes;
}

export function useModels(make: string): string[] {
  const [models, setModels] = useState<string[]>([]);
  useEffect(() => {
    setModels(VEHICLE_MAKES[make] ?? []);
    if (!make) return;
    let cancelled = false;
    getJson<ModelsRes>(`/api/vehicles/models?make=${encodeURIComponent(make)}`)
      .then((r) => {
        if (!cancelled && r.models.length) setModels(r.models.map((m) => m.name));
      })
      .catch(() => {
        /* keep static list */
      });
    return () => {
      cancelled = true;
    };
  }, [make]);
  return models;
}
