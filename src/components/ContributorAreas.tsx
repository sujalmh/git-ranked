'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';

export type AreaContributor = {
  id: number;
  username: string;
  avatarUrl: string | null;
  areas: { label: string; value: number }[];
};

function Avatar({ src, name, size = 24 }: { src: string | null; name: string; size?: number }) {
  if (!src) return <div className="rounded-full bg-white/10 border border-white/10" style={{ width: size, height: size }} />;
  return <Image src={src} alt={name} width={size} height={size} className="rounded-full border border-white/10" />;
}

const AREA_COLORS: Record<string, string> = {
  'Feature Work': 'text-emerald-300',
  'Code Review': 'text-blue-300',
  'Reliability': 'text-purple-300',
  'Releases': 'text-yellow-300',
  'Planning': 'text-pink-300',
  'Maintenance': 'text-zinc-300',
};

export function ContributorAreas({ contributors }: { contributors: AreaContributor[] }) {
  const [hoveredContributor, setHoveredContributor] = useState<number | null>(null);
  const [hoveredArea, setHoveredArea] = useState<string | null>(null);

  const { areaLabels, maxByArea } = useMemo(() => {
    const labels: string[] = [];
    const max = new Map<string, number>();
    for (const c of contributors) {
      for (const a of c.areas) {
        if (!labels.includes(a.label)) labels.push(a.label);
        max.set(a.label, Math.max(max.get(a.label) ?? 0, a.value));
      }
    }
    return { areaLabels: labels.slice(0, 6), maxByArea: max };
  }, [contributors]);

  if (contributors.length === 0 || areaLabels.length === 0) return null;

  const contributorAreas = (cid: number) => new Set(contributors.find((c) => c.id === cid)?.areas.map((a) => a.label) ?? []);
  const areaContributors = (label: string) => new Set(contributors.filter((c) => c.areas.some((a) => a.label === label)).map((c) => c.id));

  const dim = (cid: number, area: string) => {
    if (hoveredContributor !== null && hoveredContributor !== cid && !contributorAreas(cid).has(area)) return true;
    if (hoveredArea !== null && hoveredArea !== area && !areaContributors(area).has(cid)) return true;
    return false;
  };

  return (
    <div className="sleek-panel p-5">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-base font-semibold">Contributors × Areas</h2>
      </div>
      <p className="text-xs text-zinc-500 mb-4">Hover a row or column to see who owns what.</p>

      <div className="overflow-x-auto">
        <div className="min-w-full inline-block">
          <div className="grid" style={{ gridTemplateColumns: `minmax(140px, 1fr) repeat(${areaLabels.length}, minmax(56px, 1fr))` }}>
            <div />
            {areaLabels.map((label) => (
              <button
                key={label}
                type="button"
                onMouseEnter={() => setHoveredArea(label)}
                onMouseLeave={() => setHoveredArea(null)}
                className={`text-[10px] uppercase tracking-wide font-semibold pb-2 px-1 text-center transition-colors ${AREA_COLORS[label] ?? 'text-zinc-400'} ${hoveredArea === label ? 'text-white' : ''}`}
              >
                {label}
              </button>
            ))}

            {contributors.map((c) => (
              <React.Fragment key={c.id}>
                <div
                  onMouseEnter={() => setHoveredContributor(c.id)}
                  onMouseLeave={() => setHoveredContributor(null)}
                  className={`flex items-center gap-2 py-1.5 pr-2 cursor-default transition-opacity ${hoveredContributor !== null && hoveredContributor !== c.id ? 'opacity-40' : 'opacity-100'}`}
                >
                  <Avatar src={c.avatarUrl} name={c.username} size={22} />
                  <span className="text-xs text-zinc-200 truncate">{c.username}</span>
                </div>
                {areaLabels.map((label) => {
                  const area = c.areas.find((a) => a.label === label);
                  const intensity = area && maxByArea.get(label) ? area.value / (maxByArea.get(label) as number) : 0;
                  const active = intensity > 0;
                  const isDim = dim(c.id, label);
                  return (
                    <div
                      key={label}
                      onMouseEnter={() => setHoveredArea(label)}
                      onMouseLeave={() => setHoveredArea(null)}
                      className={`flex items-center justify-center py-1.5 transition-opacity ${isDim ? 'opacity-20' : 'opacity-100'}`}
                    >
                      {active ? (
                        <div
                          className={`rounded-full ${AREA_COLORS[label] ? AREA_COLORS[label].replace('text-', 'bg-') : 'bg-zinc-400'}`}
                          style={{ width: `${8 + intensity * 16}px`, height: `${8 + intensity * 16}px`, opacity: 0.35 + intensity * 0.65 }}
                          title={`${c.username} · ${label} (${area?.value ?? 0})`}
                        />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-white/5" />
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
