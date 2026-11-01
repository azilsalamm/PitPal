import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { AppStateProvider, useAppState } from './state/AppStateContext';
import DemoToolsSheet from './components/DemoToolsSheet';
import Find from './pages/Find';
import Results from './pages/Results';
import GarageDetail from './pages/GarageDetail';
import Requests from './pages/Requests';
import RequestDetail from './pages/RequestDetail';
import NewRequest from './pages/NewRequest';
import GarageView from './pages/GarageView';
import DevIntegrations from './pages/DevIntegrations';
import { StatusPill } from './components/ui';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `min-h-[48px] inline-flex items-center px-3 text-[15px] font-medium text-strong hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    isActive ? 'underline underline-offset-4 decoration-primary decoration-2' : ''
  }`;

function Shell() {
  const { demo } = useAppState();
  const [toolsOpen, setToolsOpen] = useState(false);
  const nav = (
    <>
      <NavLink to="/" className={navLinkClass} end>
        Find a garage
      </NavLink>
      <NavLink to="/requests" className={navLinkClass}>
        My requests {demo.mode === 'demo' && <StatusPill tone="demo">Demo</StatusPill>}
      </NavLink>
      <button
        className="min-h-[48px] px-3 text-[15px] font-medium text-muted hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => setToolsOpen(true)}
      >
        Demo tools
      </button>
    </>
  );
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="border-b border-borderc bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
          <div>
            <span className="text-xl font-bold tracking-tight text-primary-deep">PitPal</span>
            <span className="ml-2 hidden text-sm text-muted sm:inline">
              The right garage for your car.
            </span>
          </div>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {nav}
          </nav>
        </div>
      </header>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-borderc bg-surface md:hidden"
        aria-label="Main"
      >
        {nav}
      </nav>
      <Routes>
        <Route path="/" element={<Find />} />
        <Route path="/results" element={<Results />} />
        <Route path="/garage/:id" element={<GarageDetail />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/request/new" element={<NewRequest />} />
        <Route path="/request/:id" element={<RequestDetail />} />
        <Route path="/garage-view" element={<GarageView />} />
        <Route path="/dev/integrations" element={<DevIntegrations />} />
      </Routes>
      <DemoToolsSheet open={toolsOpen} onClose={() => setToolsOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}
