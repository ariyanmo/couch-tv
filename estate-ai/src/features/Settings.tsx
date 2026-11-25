import { useEffect, useState } from 'react';
import type { UnitSystem } from '../core/types';
import { createBackup, restoreBackup, validateBackup } from '../store/backup';
import { storageEstimate } from '../store/db';
import { flush, getState, replaceAll, toast, updateSettings, useStore } from '../store/store';
import { FileButton, LengthInput, Modal, Seg } from '../ui/components';
import { Icon } from '../ui/icons';
import { downloadBlob } from '../ui/image';

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const properties = useStore((s) => s.properties);
  const [est, setEst] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const [which, setWhich] = useState<string>('all');
  const [withPhotos, setWithPhotos] = useState(true);
  const [pending, setPending] = useState<{ data: unknown; name: string } | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const [installed] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

  useEffect(() => {
    storageEstimate().then(setEst);
  }, [properties.length]);

  const backup = async () => {
    await flush();
    const props = which === 'all' ? getState().properties : getState().properties.filter((p) => p.id === which);
    const b = await createBackup(props, getState().photos, { includePhotos: withPhotos });
    const name = `estate-ai-backup-${new Date().toISOString().slice(0, 10)}${which === 'all' ? '' : '-' + props[0]?.name.replace(/\W+/g, '-')}.json`;
    downloadBlob(new Blob([JSON.stringify(b)], { type: 'application/json' }), name);
    toast(`Backup saved (${props.length} propert${props.length === 1 ? 'y' : 'ies'}).`);
  };

  const restore = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    try {
      validateBackup(pending.data);
      await flush();
      const res = await restoreBackup(pending.data, mode, getState().properties);
      replaceAll(res.properties, res.photos);
      toast(`Restored ${pending.data.properties.length} propert${pending.data.properties.length === 1 ? 'y' : 'ies'}.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
    setPending(null);
  };

  const ai = settings.ai;
  const setAi = (patch: Partial<typeof ai>) => updateSettings((s) => ({ ...s, ai: { ...s.ai, ...patch } }));
  const external = ai.provider === 'openai-compatible' && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.)/.test(ai.endpoint);

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 980 }}>
      <div className="grid cols-2">
        <div className="card stack">
          <h3>Preferences</h3>
          <div className="row between">
            <span className="muted">Units for new properties</span>
            <Seg<UnitSystem> value={settings.units} options={[{ id: 'metric', label: 'Metric' }, { id: 'imperial', label: 'Imperial' }]} onChange={(v) => updateSettings((s) => ({ ...s, units: v }))} />
          </div>
          <label className="field">Plan grid / snap step
            <LengthInput value={settings.gridMm} units={settings.units} onCommit={(v) => v && updateSettings((s) => ({ ...s, gridMm: Math.max(5, Math.min(1000, v)) }))} />
          </label>
          <label className="check"><input type="checkbox" checked={settings.snap} onChange={(e) => updateSettings((s) => ({ ...s, snap: e.target.checked }))} /> Snap to grid by default</label>
        </div>

        <div className="card stack">
          <h3>Storage on this device</h3>
          <div className="row between"><span className="muted">Used</span><span>{est.usage != null ? `${(est.usage / 1048576).toFixed(1)} MB` : 'unknown'}{est.quota ? ` of ~${(est.quota / 1073741824).toFixed(1)} GB` : ''}</span></div>
          <div className="row between"><span className="muted">Protected from automatic clearing</span><span>{est.persisted ? 'Yes' : 'Not granted'}</span></div>
          <p className="faint" style={{ fontSize: 13 }}>
            Everything lives in this browser's IndexedDB. Safari can clear data for sites you haven't opened in a while unless the app is added to the Home
            Screen, so keep regular backups.
          </p>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={async () => { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Storage protected.' : 'The browser declined. Add the app to the Home Screen and try again.', ok ? 'ok' : 'warn'); storageEstimate().then(setEst); }}>Ask to protect storage</button>
        </div>
      </div>

      <div className="card stack">
        <h3>Backup & restore</h3>
        <div className="row">
          <select value={which} onChange={(e) => setWhich(e.target.value)} aria-label="What to back up">
            <option value="all">All properties ({properties.length})</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} /> Include photos</label>
          <button className="btn primary" onClick={backup} disabled={!properties.length} data-testid="backup"><Icon name="download" /> Download backup</button>
          <FileButton accept="application/json,.json" onFiles={async (f) => {
            try {
              const data = JSON.parse(await f[0].text());
              validateBackup(data);
              setPending({ data, name: f[0].name });
            } catch (e) {
              toast((e as Error).message || 'That file could not be read.', 'error');
            }
          }}><Icon name="upload" /> Restore from file</FileButton>
        </div>
        <p className="faint" style={{ fontSize: 13 }}>A backup is a single .json file with your properties, measurements, notes and (optionally) photos. Keep it in iCloud Drive, a USB stick or anywhere you like; nothing is uploaded by the app.</p>
      </div>

      <div className="card stack">
        <div className="card-title">
          <h3>Optional AI wording for the copilot</h3>
          <label className="check"><input type="checkbox" checked={ai.enabled} onChange={(e) => setAi({ enabled: e.target.checked })} data-testid="ai-toggle" /> Enabled</label>
        </div>
        <p className="muted" style={{ fontSize: 13.5 }}>
          Off by default. The copilot always calculates answers locally. If you turn this on, a language model only rewords those answers. The free
          option is <b>Ollama</b> running on your own computer (no account, no cost).
        </p>
        <div className="grid cols-3" style={{ gap: 10 }}>
          <label className="field">Provider
            <select value={ai.provider} onChange={(e) => setAi({ provider: e.target.value as typeof ai.provider, endpoint: e.target.value === 'ollama' ? 'http://localhost:11434' : ai.endpoint })}>
              <option value="ollama">Ollama (local, free)</option>
              <option value="openai-compatible">OpenAI-compatible endpoint</option>
            </select>
          </label>
          <label className="field">Endpoint<input value={ai.endpoint} onChange={(e) => setAi({ endpoint: e.target.value })} /></label>
          <label className="field">Model<input value={ai.model} onChange={(e) => setAi({ model: e.target.value })} /></label>
        </div>
        {ai.provider === 'openai-compatible' && (
          <label className="field">API key (stored only in this browser)<input type="password" value={ai.apiKey ?? ''} onChange={(e) => setAi({ apiKey: e.target.value })} autoComplete="off" /></label>
        )}
        {external && <div className="note err"><b>This may cost money.</b> A cloud endpoint usually charges per request and receives the facts of your question. Use a local server (Ollama, LM Studio, llama.cpp) to keep it free and private.</div>}
        <div className="row">
          <button className="btn sm" onClick={async () => {
            setTest('Testing…');
            try {
              const base = ai.endpoint.replace(/\/+$/, '');
              const r = await fetch(ai.provider === 'ollama' ? `${base}/api/tags` : `${base}/v1/models`, { headers: ai.apiKey ? { Authorization: `Bearer ${ai.apiKey}` } : {} });
              setTest(r.ok ? 'Connected.' : `Endpoint answered ${r.status}.`);
            } catch {
              setTest('Could not connect. For Ollama, start it with OLLAMA_ORIGINS set to allow this page (see docs/AI.md).');
            }
          }}>Test connection</button>
          {test && <span className="muted" style={{ fontSize: 13 }}>{test}</span>}
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card stack">
          <h3>Install on iPhone</h3>
          {installed ? <p className="muted">Running as an installed app.</p> : (
            <ol className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              <li>Open this page in Safari (over https, see the README).</li>
              <li>Tap the Share button.</li>
              <li>Choose “Add to Home Screen”, then Add.</li>
            </ol>
          )}
          <p className="faint" style={{ fontSize: 13 }}>Installed, it opens full screen, works offline, and Safari is less likely to clear its data.</p>
        </div>
        <div className="card stack">
          <h3>What a phone camera can and cannot do</h3>
          <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
            <li>Without LiDAR, photos alone cannot give reliable room dimensions. Enter tape or laser measurements.</li>
            <li>“Estimate from photo” uses a reference of known size on the same flat surface; results are saved as estimates.</li>
            <li>Apple RoomPlan and ARKit need a native app and LiDAR; WebXR room tracking is not available in iPhone Safari.</li>
            <li>Desktop photogrammetry (COLMAP, Meshroom) is free but needs a capable computer; see docs/SCANNING.md.</li>
          </ul>
        </div>
      </div>
      <p className="faint" style={{ fontSize: 12 }}>ESTATE AI {import.meta.env.MODE === 'production' ? '' : '(development) '}· open-source libraries only · no accounts, no tracking.</p>

      {pending && (
        <Modal
          title="Restore backup?"
          onClose={() => setPending(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setPending(null)}>Cancel</button>
              <button className="btn danger" onClick={() => restore('replace')}>Replace everything</button>
              <button className="btn primary" onClick={() => restore('merge')} data-testid="restore-merge">Merge</button>
            </>
          }
        >
          <p className="muted">
            {pending.name} holds {(pending.data as { properties: unknown[] }).properties.length} propert(ies). <b>Merge</b> adds them and replaces any property with the same id.
            <b> Replace everything</b> deletes all other properties on this device first.
          </p>
        </Modal>
      )}
    </div>
  );
}
