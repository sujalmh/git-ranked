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

function dynamicHeatmapStyle(value: number, max: number): React.CSSProperties {
  if (value <= 0 || max <= 0) {
    return {
      backgroundColor: 'rgba(255, 255, 255, 0.02)',
      color: '#52525b',
    };
  }

  const t = Math.min(1, Math.max(0, value / max));
  const hue = Math.round(54 - t * 30);
  const lightness = Math.round(65 - t * 15);
  const alpha = (0.2 + t * 0.75).toFixed(2);
  const textColor = t > 0.5 ? '#000000' : '#fef08a';

  return {
    backgroundColor: `hsla(${hue}, 95%, ${lightness}%, ${alpha})`,
    color: textColor,
    fontWeight: t > 0.5 ? 800 : 600,
  };
}

function Avatar({ src, name, size = 22 }: { src: string | null; name: string; size?: number }) {
  if (!src) return <div className="rounded-none bg-white/10 border border-white/10" style={{ width: size, height: size }} />;
  return <Image src={src} alt={name} width={size} height={size} className="rounded-none border border-white/10" />;
}

export function WorkAreasHeatmap({
  contributors,
  smallTeam,
}: {
  contributors: HeatmapContributor[];
  smallTeam: boolean;
}) {
  const [showAll, setShowAll] = useState(false);

  const { areaLabels, globalMax, totalAreas } = useMemo(() => {
    const labels: string[] = [];
    let max = 0;
    for (const c of contributors) {
      for (const a of c.areas) {
        if (!labels.includes(a.label)) labels.push(a.label);
        if (a.value > max) max = a.value;
      }
    }
    return { areaLabels: labels, globalMax: max, totalAreas: labels.length };
  }, [contributors]);

  if (contributors.length === 0 || areaLabels.length === 0) {
    return (
      <div className="sleek-panel p-5 text-sm text-zinc-500">No work-area data yet.</div>
    );
  }

  const areaCap = smallTeam ? areaLabels.length : MAX_AREAS_LARGE;
  const contributorCap = smallTeam ? contributors.length : MAX_CONTRIBUTORS_LARGE;
  const visibleAreas = areaLabels.slice(0, areaCap);
  const visibleContributors = showAll ? contributors : contributors.slice(0, contributorCap);
  const hiddenContributors = contributors.length - visibleContributors.length;
  const hiddenAreas = totalAreas - visibleAreas.length;



  const valueFor = (cid: number, label: string): number => {
    return contributors.find((x) => x.id === cid)?.areas.find((a) => a.label === label)?.value ?? 0;
  };

  return (
    <div className="sleek-panel p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-white">Work Areas Heatmap</h2>
        {hiddenAreas > 0 && (
          <span className="text-xs text-zinc-500">top {visibleAreas.length} of {totalAreas} areas</span>
        )}
      </div>
      <p className="text-sm text-zinc-400 mb-5">Darker cells = more activity. Hover for exact counts.</p>

      <div className="overflow-x-auto">
        <div className="min-w-full inline-block">
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `minmax(120px,1fr) repeat(${visibleAreas.length}, minmax(48px,1fr))` }}
          >
            <div />
            {visibleAreas.map((label) => (
              <div key={label} className="text-xs uppercase tracking-wide font-semibold text-center text-zinc-400 pb-2 px-1">
                {label}
              </div>
            ))}

            {visibleContributors.map((c) => (
              <React.Fragment key={c.id}>
                <div className="flex items-center gap-3 py-1.5 pr-2">
                  <Avatar src={c.avatarUrl} name={c.username} size={28} />
                  <span className="text-sm text-zinc-200 truncate">{c.username}</span>
                </div>
                {visibleAreas.map((label) => {
                  const value = valueFor(c.id, label);
                  const cellStyle = dynamicHeatmapStyle(value, globalMax);
                  return (
                    <div
                      key={label}
                      className="flex items-center justify-center py-1 rounded-none transition-colors duration-200"
                      style={cellStyle}
                      title={value > 0 ? `${c.username} · ${label}: ${value}` : `${c.username} · ${label}: none`}
                    >
                      <span className="text-sm">
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
