import { Component, lazy, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Landing from './pages/Landing';
import { BrandLogo } from './ui/BrandLogo';

// Code-split the game client: it drags in the whole Three.js engine (~1MB), and
// the landing page shouldn't pay for that on first paint. The /play route loads
// it lazily; Landing stays eager so the splash is instant.
async function withCharacterAssets<T>(load: () => Promise<T>): Promise<T> {
  const { preloadCharacterAssets } = await import('./game/character/assets');
  const [module] = await Promise.all([load(), preloadCharacterAssets()]);
  return module;
}
const InstagibClient = lazy(() => withCharacterAssets(() => import('./InstagibClient')));
const PodiumLab = lazy(() => withCharacterAssets(() => import('./PodiumLab')));
const LockerLab = lazy(() => withCharacterAssets(() => import('./LockerLab')));
const RewardsLab = lazy(() => withCharacterAssets(() => import('./ui/RewardsLab')));
const GunLab = lazy(() => withCharacterAssets(() => import('./game/gun/GunLab')));
const FxLab = lazy(() => withCharacterAssets(() => import('./game/fx/FxLab')));
const CustomGunLab = lazy(() => withCharacterAssets(() => import('./game/gun/custom/CustomGunLab')));
const MapPhoto = import.meta.env.DEV ? lazy(() => withCharacterAssets(() => import('./game/MapPhoto'))) : null;
const AdminDashboard = lazy(() => import('./AdminDashboard'));

class AssetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="menu-root fixed inset-0 flex flex-col items-center justify-center gap-4 text-white" role="alert">
      <BrandLogo className='brand-loading-logo' />
      <p>The game could not finish loading. Check your connection and try again.</p>
      <button className="rounded border border-white/40 px-5 py-2" onClick={() => window.location.reload()}>Retry loading</button>
    </div>;
  }
}

// Shared artwork stays visible while the route and character assets download.
const Loading = () => (
  <div
    role='status'
    aria-live='polite'
    className='brand-loading fixed inset-0 flex flex-col items-center justify-center text-white'
  >
    <span className='brand-loading-kicker'>One railgun. One shot. One kill.</span>
    <BrandLogo className='brand-loading-logo' priority />
    <div className='brand-loading-status'>Preparing your arena <span aria-hidden='true'>↗</span></div>
    <div className='brand-loading-bar' aria-hidden='true' />
    <span className='brand-loading-footer'>Good things come to those who frag.</span>
  </div>
);

// NOTE: intentionally NOT wrapped in <StrictMode>. The game client owns a WebGL
// context, pointer-lock, and a WebSocket; React 18/19 StrictMode double-invokes
// effects in dev, which would spin up two GL contexts / two sockets. Production
// builds never run StrictMode anyway, so we keep dev and prod identical here.
createRoot(document.getElementById('root')!).render(
  <AssetBoundary>
  <BrowserRouter>
    <Routes>
      {MapPhoto && <Route path="/mapphoto" element={<Suspense fallback={<Loading />}><MapPhoto /></Suspense>} />}
      <Route path="/" element={<Landing />} />
      <Route
        path="/play"
        element={
          <Suspense fallback={<Loading />}>
            <InstagibClient />
          </Suspense>
        }
      />
      <Route
        path="/podiumlab"
        element={
          <Suspense fallback={<Loading />}>
            <PodiumLab />
          </Suspense>
        }
      />
      <Route
        path="/lockerlab"
        element={
          <Suspense fallback={<Loading />}>
            <LockerLab />
          </Suspense>
        }
      />
      <Route
        path="/rewardslab"
        element={
          <Suspense fallback={<Loading />}>
            <RewardsLab />
          </Suspense>
        }
      />
      <Route
        path="/gunlab"
        element={
          <Suspense fallback={<Loading />}>
            <GunLab />
          </Suspense>
        }
      />
      <Route
        path="/fxlab"
        element={
          <Suspense fallback={<Loading />}>
            <FxLab />
          </Suspense>
        }
      />
      <Route
        path="/customgunlab"
        element={
          <Suspense fallback={<Loading />}>
            <CustomGunLab />
          </Suspense>
        }
      />
      <Route
        path="/admin"
        element={
          <Suspense fallback={<Loading />}>
            <AdminDashboard />
          </Suspense>
        }
      />
    </Routes>
  </BrowserRouter>
  </AssetBoundary>,
);
