import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import type { ReactNode } from 'react';
import {
  buildDemoGarages,
  initialDemoState,
  loadDemoState,
  reduce as demoReduce,
  saveDemoState,
  type DemoAction,
  type DemoState,
  type Garage,
  type JobRequest,
  type SearchPreferences,
  type VehicleProfile,
} from '@pitpal/shared';

export interface Journey {
  vehicle?: VehicleProfile;
  job?: JobRequest;
  prefs?: SearchPreferences;
  step?: string;
}

type JourneyAction =
  | { type: 'patch'; patch: Partial<Journey> }
  | { type: 'reset' };

const JOURNEY_KEY = 'pitpal.journey.v1';

function loadJourney(): Journey {
  try {
    const raw = sessionStorage.getItem(JOURNEY_KEY);
    return raw ? (JSON.parse(raw) as Journey) : {};
  } catch {
    return {};
  }
}

function journeyReducer(state: Journey, action: JourneyAction): Journey {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'reset':
      return {};
  }
}

interface AppState {
  journey: Journey;
  updateJourney: (patch: Partial<Journey>) => void;
  resetJourney: () => void;
  demo: DemoState;
  dispatchDemo: (action: DemoAction) => void;
  /** Demo garage directory with profile overrides applied. */
  garages: Garage[];
}

const Ctx = createContext<AppState | null>(null);

function demoWithPersist(
  state: DemoState,
  action: DemoAction,
): DemoState {
  const next = demoReduce(state, action);
  saveDemoState(window.localStorage, next);
  return next;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [journey, dispatchJourney] = useReducer(journeyReducer, undefined, loadJourney);
  const [demo, rawDispatchDemo] = useReducer(
    demoWithPersist,
    undefined,
    () => loadDemoState(typeof window !== 'undefined' ? window.localStorage : undefined) ?? initialDemoState(),
  );

  // Persist journey on every change.
  useEffect(() => {
    try {
      sessionStorage.setItem(JOURNEY_KEY, JSON.stringify(journey));
    } catch {
      /* sessionStorage unavailable */
    }
  }, [journey]);

  // Expire open offers on load and every 60 s.
  useEffect(() => {
    const tick = () => rawDispatchDemo({ type: 'tick', nowIso: new Date().toISOString() });
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const updateJourney = useCallback(
    (patch: Partial<Journey>) => dispatchJourney({ type: 'patch', patch }),
    [],
  );
  const resetJourney = useCallback(() => dispatchJourney({ type: 'reset' }), []);
  const dispatchDemo = useCallback((action: DemoAction) => rawDispatchDemo(action), []);

  const garages = useMemo(() => {
    const base = buildDemoGarages(new Date().toISOString());
    return base.map((g) => {
      const ov = demo.profileOverrides[g.id];
      if (!ov) return g;
      return {
        ...g,
        services: ov.services ?? g.services,
        restrictions: ov.restrictions ?? g.restrictions,
        availability: ov.availability ?? g.availability,
        participation: ov.acceptingEnquiries === undefined
          ? g.participation
          : { ...g.participation, acceptingEnquiries: ov.acceptingEnquiries },
      };
    });
  }, [demo.profileOverrides]);

  const value = useMemo(
    () => ({ journey, updateJourney, resetJourney, demo, dispatchDemo, garages }),
    [journey, updateJourney, resetJourney, demo, dispatchDemo, garages],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppState outside provider');
  return ctx;
}
