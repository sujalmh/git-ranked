'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';

export type HeatmapContributor = {
  id: number;
  username: string;
  avatarUrl: string | null;
  areas: { label: string; value: number }[];
};

const MAX_AREAS_LARGE = 5;
const MAX_CONTRIBUTORS_LARGE = 6;

function intensityClass(intensity: number): { bg: string, text: string } {
  if (intensity <= 0) return { bg: 'bg-white/[0.04]', text: 'text-zinc-600' };
  if (intensity < 0.25) return { bg: 'bg-[#ccff00]/20', text: 'text-white' };
  if (intensity < 0.5) return { bg: 'bg-[#ccff00]/40', text: 'text-white' };
  if (intensity < 0.75) return { bg: 'bg-[#ccff00]/70', text: 'text-black' };
  return { bg: 'bg-[#ccff00]', text: 'text-black font-bold' };
}

function Avatar({ src, name, size = 22 }: { src: string | null; name: string; size?: number }) {
  if (!src) return <div className="rounded-full bg-white/10 border border-white/10" style={{ width: size, height: size }} />;
  return <Image src={src} alt={name} width={size} height={size} className="rounded-full border border-white/10" />;
}

export function WorkAreasHeatmap({
  contributors,
  smallTeam,
}: {
  contributors: HeatmapContributor[];
  smallTeam: boolean;
}) {
  const [showAll, setShowAll] = useState(false);

  const { areaLabels, maxByArea, totalAreas } = useMemo(() => {
    const labels: string[] = [];
    const max = new Map<string, number>();
    for (const c of contributors) {
      for (const a of c.areas) {
        if (!labels.includes(a.label)) labels.push(a.label);
        max.set(a.label, Math.max(max.get(a.label) ?? 0, a.value));
      }
    }
    return { areaLabels: labels, maxByArea: max, totalAreas: labels.length };
  }, [contributors]);

  if (contributors.length === 0 || areaLabels.length === 0) {
    return (
      <div className="stark-panel p-5 text-sm text-zinc-500">No work-area data yet.</div>
    );
  }

  const areaCap = smallTeam ? areaLabels.length : MAX_AREAS_LARGE;
  const contributorCap = smallTeam ? contributors.length : MAX_CONTRIBUTORS_LARGE;
  const visibleAreas = areaLabels.slice(0, areaCap);
  const visibleContributors = showAll ? contributors : contributors.slice(0, contributorCap);
  const hiddenContributors = contributors.length - visibleContributors.length;
  const hiddenAreas = totalAreas - visibleAreas.length;

  const intensityFor = (cid: number, label: string): number => {
    const c = contributors.find((x) => x.id === cid);
    const area = c?.areas.find((a) => a.label === label);
    const max = maxByArea.get(label) ?? 0;
    return area && max > 0 ? area.value / max : 0;
  };

  const valueFor = (cid: number, label: string): number => {
    return contributors.find((x) => x.id === cid)?.areas.find((a) => a.label === label)?.value ?? 0;
  };

  return (
    <div className="stark-panel p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold">Work Areas Heatmap</h2>
        {hiddenAreas > 0 && (
          <span className="text-[10px] text-zinc-500">top {visibleAreas.length} of {totalAreas} areas</span>
        )}
      </div>
      <p className="text-xs text-zinc-500 mb-4">Darker cells = more activity. Hover for exact counts.</p>

      <div className="overflow-x-auto">
        <div className="min-w-full inline-block">
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `minmax(120px,1fr) repeat(${visibleAreas.length}, minmax(48px,1fr))` }}
          >
            <div />
            {visibleAreas.map((label) => (
              <div key={label} className="text-[10px] uppercase tracking-wide font-semibold text-center text-zinc-400 pb-1 px-1">
                {label}
              </div>
            ))}

            {visibleContributors.map((c) => (
              <React.Fragment key={c.id}>
                <div className="flex items-center gap-2 py-1 pr-2">
                  <Avatar src={c.avatarUrl} name={c.username} />
                  <span className="text-xs text-zinc-200 truncate">{c.username}</span>
                </div>
                {visibleAreas.map((label) => {
                  const intensity = intensityFor(c.id, label);
                  const value = valueFor(c.id, label);
                  const style = intensityClass(intensity);
                  return (
                    <div
                      key={label}
                      className={`flex items-center justify-center py-1 rounded ${style.bg}`}
                      title={value > 0 ? `${c.username} · ${label}: ${value}` : `${c.username} · ${label}: none`}
                    >
                      <span className={`text-[10px] ${style.text}`}>
                        {value > 0 ? value : ''}
                      </span>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {hiddenContributors > 0 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 w-full text-xs font-medium text-zinc-400 hover:text-white border border-white/5 rounded-lg py-2 hover:bg-white/5 transition-colors"
        >
          Show {hiddenContributors} more contributor{hiddenContributors === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}
