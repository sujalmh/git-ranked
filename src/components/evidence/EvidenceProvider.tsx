'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { GitCommit, GitPullRequest, MessageSquare, Bug, Tag, X, Search } from 'lucide-react';
import type { EvidenceItem } from '@/lib/evidence';

type Signal = { label: string; value: string };

type DrawerPayload = {
  title: string;
  blurb?: string;
  signals?: Signal[];
  items: EvidenceItem[];
};

type EvidenceContextValue = {
  open: (payload: DrawerPayload) => void;
  close: () => void;
};

const EvidenceContext = createContext<EvidenceContextValue | null>(null);

export function useEvidence() {
  const ctx = useContext(EvidenceContext);
  if (!ctx) throw new Error('useEvidence must be used within EvidenceProvider');
  return ctx;
}

const KIND_ICON: Record<EvidenceItem['kind'], React.ReactNode> = {
  pr: <GitPullRequest className="w-3.5 h-3.5 text-green-400" />,
  commit: <GitCommit className="w-3.5 h-3.5 text-zinc-400" />,
  review: <MessageSquare className="w-3.5 h-3.5 text-blue-400" />,
  issue: <Bug className="w-3.5 h-3.5 text-red-400" />,
  release: <Tag className="w-3.5 h-3.5 text-yellow-400" />,
};

const KIND_LABEL: Record<EvidenceItem['kind'], string> = {
  pr: 'Pull Request',
  commit: 'Commit',
  review: 'Review',
  issue: 'Issue',
  release: 'Release',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export function EvidenceProvider({ children }: { children: React.ReactNode }) {
  const [payload, setPayload] = useState<DrawerPayload | null>(null);
  const [revealed, setRevealed] = useState(0);

  const open = useCallback((p: DrawerPayload) => {
    setPayload(p);
    setRevealed(0);
  }, []);

  const close = useCallback(() => {
    setPayload(null);
    setRevealed(0);
  }, []);

  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload, close]);

  useEffect(() => {
    if (!payload || payload.items.length === 0) return;
    const target = payload.items.length;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setRevealed(i);
      if (i >= target) window.clearInterval(id);
    }, 60);
    return () => window.clearInterval(id);
  }, [payload]);

  const visible = payload !== null;

  return (
    <EvidenceContext.Provider value={{ open, close }}>
      {children}
      <div
        className={`fixed inset-0 z-[60] transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-hidden={!visible}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
        <aside
          className={`absolute right-0 top-0 h-full w-full max-w-md bg-zinc-950/95 border-l border-white/10 shadow-2xl transition-transform duration-300 ease-out flex flex-col ${visible ? 'translate-x-0' : 'translate-x-full'}`}
        >
          {payload && (
            <>
              <div className="flex items-start justify-between gap-4 p-5 border-b border-white/10">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-accent font-semibold mb-1">Evidence</div>
                  <h3 className="text-base font-semibold text-white leading-tight">{payload.title}</h3>
                  {payload.blurb && <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{payload.blurb}</p>}
                </div>
                <button onClick={close} className="p-1.5 rounded-none hover:bg-white/10 text-zinc-400 hover:text-white transition-colors shrink-0" aria-label="Close evidence">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {payload.signals && payload.signals.length > 0 && (
                <div className="grid grid-cols-3 gap-2 p-4 border-b border-white/10">
                  {payload.signals.map((s) => (
                    <div key={s.label} className="rounded-none bg-white/5 border border-white/5 px-2 py-2 text-center">
                      <div className="text-base font-bold text-white leading-none">{s.value}</div>
                      <div className="text-[10px] text-zinc-500 mt-1 leading-tight">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {payload.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Search className="w-6 h-6 text-zinc-600 mb-2" />
                    <p className="text-sm text-zinc-500">No linked events found.</p>
                    <p className="text-xs text-zinc-600 mt-1">This insight may be AI-synthesized with no single source event.</p>
                  </div>
                ) : (
                  payload.items.slice(0, revealed).map((item) => (
                    <div key={item.id} className="flex gap-3 rounded-none border border-white/5 bg-white/5 p-3 hover:bg-white/10 transition-colors">
                      <div className="w-7 h-7 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0">
                        {KIND_ICON[item.kind]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">{KIND_LABEL[item.kind]}</span>
                          {item.prNumber && <span className="text-[10px] text-accent font-medium">#{item.prNumber}</span>}
                          <span className="text-[10px] text-zinc-600 ml-auto">{formatDate(item.date)}</span>
                        </div>
                        <div className="text-sm text-zinc-200 truncate">{item.title}</div>
                        <div className="text-xs text-zinc-500">by {item.actor}{item.additions ? ` · +${item.additions}` : ''}{item.deletions ? ` −${item.deletions}` : ''}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </EvidenceContext.Provider>
  );
}
