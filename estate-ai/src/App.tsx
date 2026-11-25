import { Suspense, lazy, useState, type ReactNode } from 'react';
import { Icon } from './ui/icons';
import { go, useRoute } from './ui/router';
import { useStore } from './store/store';
import { Modal } from './ui/components';
import type { Property } from './core/types';

const Dashboard = lazy(() => import('./features/Dashboard'));
const Overview = lazy(() => import('./features/Overview'));
const Scanner = lazy(() => import('./features/Scanner'));
const RoomEditor = lazy(() => import('./features/RoomEditor'));
const PlanEditor = lazy(() => import('./features/PlanEditor'));
const Viewer3D = lazy(() => import('./features/Viewer3D'));
const Studio = lazy(() => import('./features/Studio'));
const Staging = lazy(() => import('./features/Staging'));
const Inspection = lazy(() => import('./features/Inspection'));
const AreaCalc = lazy(() => import('./features/AreaCalc'));
const Photos = lazy(() => import('./features/Photos'));
const Elevations = lazy(() => import('./features/Elevations'));
const Copilot = lazy(() => import('./features/Copilot'));
const Listing = lazy(() => import('./features/Listing'));
const Settings = lazy(() => import('./features/Settings'));

export const MODULES: { id: string; label: string; icon: string; group: 'capture' | 'design' | 'report' }[] = [
  { id: '', label: 'Overview', icon: 'grid', group: 'capture' },
  { id: 'scan', label: 'Scanner', icon: 'scan', group: 'capture' },
  { id: 'plan', label: 'Floor plan', icon: 'plan', group: 'capture' },
  { id: '3d', label: '3D model', icon: 'cube', group: 'capture' },
  { id: 'photos', label: 'Photos', icon: 'image', group: 'capture' },
  { id: 'studio', label: 'Renovation studio', icon: 'brush', group: 'design' },
  { id: 'staging', label: 'Virtual staging', icon: 'sofa', group: 'design' },
  { id: 'elevations', label: 'Wall elevations', icon: 'wall', group: 'design' },
  { id: 'inspect', label: 'Inspection', icon: 'clipboard', group: 'report' },
  { id: 'area', label: 'Area calculator', icon: 'ruler', group: 'report' },
  { id: 'copilot', label: 'Copilot', icon: 'chat', group: 'report' },
  { id: 'listing', label: 'Listing & export', icon: 'doc', group: 'report' },
];

export interface PageProps {
  property: Property;
  params: string[];
}

export function App() {
  const route = useRoute();
  const ready = useStore((s) => s.ready);
  const toast = useStore((s) => s.toast);
  const properties = useStore((s) => s.properties);
  const [more, setMore] = useState(false);

  const isProp = route[0] === 'p' && route[1];
  const property = isProp ? properties.find((p) => p.id === route[1]) : undefined;
  const mod = isProp ? route[2] ?? '' : route[0] ?? '';

  let content: ReactNode;
  let title = 'Properties';
  let full = false;
  if (!ready) content = <div className="empty">Loading…</div>;
  else if (route[0] === 'settings') {
    title = 'Settings';
    content = <Settings />;
  } else if (isProp && !property) {
    title = 'Not found';
    content = (
      <div className="empty">
        <h2>This property is not on this device</h2>
        <button className="btn" onClick={() => go('')}>
          Back to properties
        </button>
      </div>
    );
  } else if (property) {
    const params = route.slice(3);
    const m = MODULES.find((x) => x.id === mod);
    title = m?.label ?? 'Overview';
    const props = { property, params };
    switch (mod) {
      case 'scan':
        if (params[0]) {
          title = property.rooms.find((r) => r.id === params[0])?.name ?? 'Room';
          content = <RoomEditor {...props} />;
        } else content = <Scanner {...props} />;
        break;
      case 'plan':
        full = true;
        content = <PlanEditor {...props} />;
        break;
      case '3d':
        full = true;
        content = <Viewer3D {...props} />;
        break;
      case 'studio':
        content = <Studio {...props} />;
        break;
      case 'staging':
        content = <Staging {...props} />;
        break;
      case 'inspect':
        content = <Inspection {...props} />;
        break;
      case 'area':
        content = <AreaCalc {...props} />;
        break;
      case 'photos':
        content = <Photos {...props} />;
        break;
      case 'elevations':
        content = <Elevations {...props} />;
        break;
      case 'copilot':
        content = <Copilot {...props} />;
        break;
      case 'listing':
        content = <Listing {...props} />;
        break;
      default:
        content = <Overview {...props} />;
    }
  } else content = <Dashboard />;

  const pgo = (id: string) => property && go(`p/${property.id}${id ? '/' + id : ''}`);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">EA</div>
          <div>
            <div className="brand-name">ESTATE AI</div>
            <div className="brand-sub">Property scanner & design studio</div>
          </div>
        </div>
        <button className={`nav-item ${!property && mod === '' ? 'active' : ''}`} onClick={() => go('')}>
          <Icon name="building" /> Properties
        </button>
        {property && (
          <>
            <div className="nav-section">Property</div>
            <div className="nav-prop">
              <b>{property.name}</b>
              <span className="faint" style={{ fontSize: 12 }}>
                {property.address || 'No address'}
              </span>
            </div>
            {(['capture', 'design', 'report'] as const).map((g) => (
              <div key={g}>
                <div className="nav-section">{g === 'capture' ? 'Capture' : g === 'design' ? 'Design' : 'Report'}</div>
                {MODULES.filter((m) => m.group === g).map((m) => (
                  <button key={m.id} className={`nav-item ${mod === m.id ? 'active' : ''}`} onClick={() => pgo(m.id)}>
                    <Icon name={m.icon} /> {m.label}
                  </button>
                ))}
              </div>
            ))}
          </>
        )}
        <div className="spacer" />
        <button className={`nav-item ${route[0] === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}>
          <Icon name="settings" /> Settings & backup
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          {(property || route[0] === 'settings') && (
            <button
              className="btn ghost icon"
              aria-label="Back"
              onClick={() => (property && mod === 'scan' && route[3] ? pgo('scan') : property && mod ? pgo('') : go(''))}
            >
              <Icon name="back" />
            </button>
          )}
          <h1>
            {property && <span className="crumb">{property.name}</span>}
            {title}
          </h1>
        </header>
        <main className={`page ${full ? 'full' : ''}`}>
          <Suspense fallback={<div className="empty">Loading…</div>}>{content}</Suspense>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {property ? (
          <>
            {[
              { id: '', label: 'Overview', icon: 'grid' },
              { id: 'scan', label: 'Scan', icon: 'scan' },
              { id: 'plan', label: 'Plan', icon: 'plan' },
              { id: '3d', label: '3D', icon: 'cube' },
            ].map((b) => (
              <button key={b.id} className={mod === b.id ? 'active' : ''} onClick={() => pgo(b.id)}>
                <Icon name={b.icon} />
                {b.label}
              </button>
            ))}
            <button className={!['', 'scan', 'plan', '3d'].includes(mod) ? 'active' : ''} onClick={() => setMore(true)}>
              <Icon name="more" />
              More
            </button>
          </>
        ) : (
          <>
            <button className={route[0] !== 'settings' ? 'active' : ''} onClick={() => go('')}>
              <Icon name="building" />
              Properties
            </button>
            <button className={route[0] === 'settings' ? 'active' : ''} onClick={() => go('settings')}>
              <Icon name="settings" />
              Settings
            </button>
          </>
        )}
      </nav>

      {more && property && (
        <Modal title="More tools" onClose={() => setMore(false)}>
          <div className="grid cols-2" style={{ gap: 8 }}>
            {MODULES.filter((m) => !['', 'scan', 'plan', '3d'].includes(m.id)).map((m) => (
              <button
                key={m.id}
                className="list-item"
                onClick={() => {
                  setMore(false);
                  pgo(m.id);
                }}
              >
                <Icon name={m.icon} size={20} />
                <span className="grow" style={{ textAlign: 'left' }}>
                  {m.label}
                </span>
              </button>
            ))}
            <button
              className="list-item"
              onClick={() => {
                setMore(false);
                go('settings');
              }}
            >
              <Icon name="settings" size={20} />
              <span className="grow" style={{ textAlign: 'left' }}>
                Settings & backup
              </span>
            </button>
            <button
              className="list-item"
              onClick={() => {
                setMore(false);
                go('');
              }}
            >
              <Icon name="building" size={20} />
              <span className="grow" style={{ textAlign: 'left' }}>
                All properties
              </span>
            </button>
          </div>
        </Modal>
      )}

      {toast && <div className={`toast ${toast.kind ?? ''}`}>{toast.text}</div>}
    </div>
  );
}
