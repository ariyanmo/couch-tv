import { useEffect, useRef, useState } from 'react';
import type { PageProps } from '../App';
import { aiRephrase } from '../core/ai';
import { ask, type CopilotAnswer } from '../core/copilot';
import { useStore } from '../store/store';
import { StatusChip } from '../ui/components';
import { Icon } from '../ui/icons';
import { go } from '../ui/router';

interface Msg {
  id: number;
  who: 'user' | 'bot';
  text: string;
  answer?: CopilotAnswer;
  ai?: { text?: string; error?: string; loading?: boolean };
}

const SUGGESTED = [
  'How large is the living room?',
  'What is the total measured floor area?',
  'Will a king-size bed fit?',
  'How much flooring would I need?',
  'How much wall surface needs painting?',
  'What renovation opportunities are visible?',
  'Write a property description',
  'Summarize the property',
  'What still needs measuring?',
];

let seq = 0;

export default function Copilot({ property: p }: PageProps) {
  const ai = useStore((s) => s.settings.ai);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: ++seq, who: 'bot', text: `I answer questions about ${p.name} from its saved measurements and notes. Numbers are calculated on this device; when something isn't recorded I'll say so instead of guessing.` }]);
  const [q, setQ] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    setQ('');
    const answer = ask(p, t);
    const id = ++seq;
    setMsgs((m) => [...m, { id: ++seq, who: 'user', text: t }, { id, who: 'bot', text: answer.text, answer, ai: ai.enabled && answer.intent !== 'help' ? { loading: true } : undefined }]);
    if (ai.enabled && answer.intent !== 'help') {
      try {
        const out = await aiRephrase(ai, t, answer);
        setMsgs((m) => m.map((x) => (x.id === id ? { ...x, ai: { text: out } } : x)));
      } catch (e) {
        setMsgs((m) => m.map((x) => (x.id === id ? { ...x, ai: { error: (e as Error).message || 'The AI endpoint could not be reached.' } } : x)));
      }
    }
  };

  return (
    <div className="stack" style={{ gap: 14, maxWidth: 900 }}>
      <div className="note">
        {ai.enabled ? (
          <>Optional AI wording is <b>on</b> ({ai.provider === 'ollama' ? 'local model' : 'external endpoint'}: {ai.model}). It only rewords the local answer; the local answer is always shown first.</>
        ) : (
          <>Running fully offline with built-in calculations. Optional AI wording is off (<a style={{ cursor: 'pointer' }} onClick={() => go('settings')}>settings</a>).</>
        )}
      </div>
      <div className="chat" data-testid="chat">
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.who}`}>
            {m.text}
            {m.answer && m.answer.facts.length > 0 && (
              <div className="facts">
                {m.answer.facts.map((f, i) => (
                  <div key={i}>
                    <span>{f.label}:</span> <b>{f.value}</b> {f.status && <StatusChip status={f.status} short />}
                  </div>
                ))}
              </div>
            )}
            {m.ai && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', fontSize: 13.5 }}>
                <span className="faint" style={{ fontSize: 12 }}>AI wording (check against the facts above)</span>
                <div>{m.ai.loading ? '…' : m.ai.error ? <span style={{ color: 'var(--err)' }}>{m.ai.error}</span> : m.ai.text}</div>
              </div>
            )}
            {m.answer?.roomIds?.length === 1 && (
              <div style={{ marginTop: 8 }}>
                <button className="btn sm ghost" onClick={() => go(`p/${p.id}/scan/${m.answer!.roomIds![0]}`)}>Open room</button>
              </div>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="row" style={{ gap: 6 }}>
        {SUGGESTED.map((s) => (
          <button key={s} className="btn sm" onClick={() => send(s)}>{s}</button>
        ))}
      </div>
      <form className="row nowrap" onSubmit={(e) => { e.preventDefault(); send(q); }} style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '8px 0' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this property…" style={{ flex: 1 }} aria-label="Question" data-testid="copilot-input" />
        <button className="btn primary" type="submit"><Icon name="chat" /> Ask</button>
      </form>
    </div>
  );
}
