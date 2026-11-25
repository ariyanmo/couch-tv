import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Figure } from '../core/calc';
import type { Measure, MeasureMethod, Provenance, UnitSystem } from '../core/types';
import { STATUS_LABEL, fmtArea, fmtLen, lenToInput, parseLength } from '../core/units';
import { getPhotoBlob } from '../store/db';
import { Icon } from './icons';

export function StatusChip({ status, short }: { status: Provenance; short?: boolean }) {
  const label = short ? { measured: 'Measured', drawn: 'Drawn', estimated: 'Estimate', unknown: 'Missing' }[status] : STATUS_LABEL[status];
  return (
    <span className={`chip ${status}`} title={STATUS_EXPLAIN[status]}>
      {label}
    </span>
  );
}

export const STATUS_EXPLAIN: Record<Provenance, string> = {
  measured: 'Entered from a tape, laser or plan measurement (or calculated only from such measurements).',
  drawn: 'Follows from the shape drawn on screen. Not verified by a measurement.',
  estimated: 'An estimate: camera reference, typical size or a guess. Do not rely on it for ordering or listings.',
  unknown: 'Not recorded yet.',
};

export function FigureValue({ f, units, kind = 'area', digits }: { f: Figure; units: UnitSystem; kind?: 'area' | 'length'; digits?: number }) {
  return (
    <span className="row nowrap" style={{ gap: 8 }} title={f.reasons.join('\n')}>
      <span>{f.status === 'unknown' ? '—' : kind === 'area' ? fmtArea(f.value, units, digits) : fmtLen(f.value, units)}</span>
      <StatusChip status={f.status} short />
    </span>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon = 'building', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h2>{title}</h2>
      <div className="stack" style={{ alignItems: 'center' }}>
        {children}
      </div>
    </div>
  );
}

export const METHODS: { id: MeasureMethod; label: string; status: Provenance }[] = [
  { id: 'tape', label: 'Tape measure', status: 'measured' },
  { id: 'laser', label: 'Laser measure', status: 'measured' },
  { id: 'plan', label: 'From a plan', status: 'measured' },
  { id: 'camera-reference', label: 'Camera estimate', status: 'estimated' },
  { id: 'camera-scan', label: 'Camera scan', status: 'estimated' },
  { id: 'manual-estimate', label: 'Rough estimate', status: 'estimated' },
];

export const methodStatus = (m: MeasureMethod): Provenance => METHODS.find((x) => x.id === m)?.status ?? 'drawn';

/** Text box for a length that accepts metric or imperial input. */
export function LengthInput({
  value,
  units,
  onCommit,
  placeholder,
  autoFocus,
  ariaLabel,
  width,
}: {
  value: number | null | undefined;
  units: UnitSystem;
  onCommit: (mm: number | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
  width?: number;
}) {
  const [text, setText] = useState(lenToInput(value, units));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(lenToInput(value, units));
  }, [value, units]);
  const commit = () => {
    if (!text.trim()) {
      setBad(false);
      onCommit(null);
      return;
    }
    const v = parseLength(text, units);
    if (v == null || v <= 0) {
      setBad(true);
      return;
    }
    setBad(false);
    onCommit(v);
  };
  return (
    <input
      aria-label={ariaLabel}
      inputMode="decimal"
      autoFocus={autoFocus}
      value={text}
      placeholder={placeholder ?? (units === 'metric' ? 'e.g. 3.45 or 3450mm' : `e.g. 12' 6"`)}
      style={{ width: width ?? '100%', borderColor: bad ? 'var(--err)' : undefined }}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      title={bad ? 'Could not read that length' : undefined}
    />
  );
}

/** Edit a Measure: value + method; status follows the method. */
export function MeasureEditor({ m, units, onChange, label }: { m: Measure; units: UnitSystem; onChange: (m: Measure) => void; label?: string }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      {label && (
        <div className="row between">
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{label}</span>
          <StatusChip status={m.status} short />
        </div>
      )}
      <div className="row nowrap" style={{ gap: 6 }}>
        <LengthInput
          value={m.status === 'unknown' ? null : m.value}
          units={units}
          ariaLabel={label}
          onCommit={(v) =>
            onChange(v == null ? { value: 0, status: 'unknown' } : { value: v, status: methodStatus(m.method ?? 'tape'), method: m.method && m.method !== 'drawn' ? m.method : 'tape', at: Date.now() })
          }
        />
        <select
          aria-label="Method"
          value={m.method && m.method !== 'drawn' ? m.method : 'tape'}
          style={{ width: 140, flex: 'none', maxWidth: '45%' }}
          onChange={(e) => {
            const method = e.target.value as MeasureMethod;
            onChange({ ...m, method, status: m.status === 'unknown' ? 'unknown' : methodStatus(method), at: Date.now() });
          }}
        >
          {METHODS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)} role="tab" aria-selected={o.id === value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const urlCache = new Map<string, string>();
export function usePhotoUrl(id: string | undefined, which: 'blob' | 'thumb' = 'thumb') {
  const key = id ? `${id}:${which}` : '';
  const [url, setUrl] = useState<string | undefined>(() => (key ? urlCache.get(key) : undefined));
  useEffect(() => {
    if (!id) return;
    const hit = urlCache.get(key);
    if (hit) {
      setUrl(hit);
      return;
    }
    let live = true;
    getPhotoBlob(id, which).then((b) => {
      if (!b || !live) return;
      const u = URL.createObjectURL(b);
      urlCache.set(key, u);
      setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [id, which, key]);
  return url;
}

export function PhotoThumb({ id, caption, selected, onClick }: { id: string; caption?: string; selected?: boolean; onClick?: () => void }) {
  const url = usePhotoUrl(id);
  return (
    <div className={`thumb ${selected ? 'sel' : ''}`} onClick={onClick}>
      {url ? <img src={url} alt={caption ?? ''} loading="lazy" /> : null}
      {selected != null && <div className="tick" />}
      {caption && <div className="cap">{caption}</div>}
    </div>
  );
}

export function Confirm({ title, text, onYes, onClose, yes = 'Delete', danger = true }: { title: string; text: string; onYes: () => void; onClose: () => void; yes?: string; danger?: boolean }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? 'danger' : 'primary'}`}
            onClick={() => {
              onYes();
              onClose();
            }}
          >
            {yes}
          </button>
        </>
      }
    >
      <p className="muted">{text}</p>
    </Modal>
  );
}

export function Stat({ label, value, sub, gold }: { label: string; value: ReactNode; sub?: ReactNode; gold?: boolean }) {
  return (
    <div className="card stat">
      <span className="label">{label}</span>
      <span className={`value ${gold ? 'gold' : ''}`}>{value}</span>
      {sub && <span className="muted" style={{ fontSize: 13 }}>{sub}</span>}
    </div>
  );
}

export function FileButton({ accept, multiple, onFiles, children, className, capture }: { accept: string; multiple?: boolean; onFiles: (f: File[]) => void; children: ReactNode; className?: string; capture?: 'environment' | 'user' }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={className ?? 'btn'} onClick={() => ref.current?.click()} type="button">
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        capture={capture}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}
