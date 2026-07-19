import Image from 'next/image';
import Link from 'next/link';
import type { ContributorInsight } from '@/lib/contributor-insights';

function VelocityBars({ values }: { values: number[] }) {
  if (!values || values.length === 0) return null;
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-5">
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(2, (v / max) * 20) : 0;
        return (
          <div
            key={i}
            className="w-1 rounded-sm bg-indigo-400/60"
            style={{ height: `${h}px` }}
            title={`Week ${i + 1}: ${v} events`}
          />
        );
      })}
    </div>
  );
}

function Avatar({ src, name, size = 32 }: { src: string | null; name: string; size?: number }) {
  if (!src) return <div className="rounded-full bg-white/10 border border-white/10" style={{ width: size, height: size }} />;
  return <Image src={src} alt={name} width={size} height={size} className="rounded-full border border-white/10" />;
}

const RANK_STYLES: Record<number, { badge: string; ring: string; label: string }> = {
  1: { badge: 'bg-amber-500/20 border-amber-500/40 text-amber-300', ring: 'ring-2 ring-amber-500/30', label: 'Gold' },
  2: { badge: 'bg-zinc-400/20 border-zinc-400/40 text-zinc-200', ring: 'ring-2 ring-zinc-400/30', label: 'Silver' },
  3: { badge: 'bg-orange-700/20 border-orange-700/40 text-orange-400', ring: 'ring-2 ring-orange-700/30', label: 'Bronze' },
};

export function CollaboratorLeaderboard({
  contributors,
  repoOwner,
  repoName,
}: {
  contributors: ContributorInsight[];
  repoOwner: string;
  repoName: string;
}) {
  return (
    <div className="space-y-2">
      {contributors.map((c, idx) => {
        const rank = idx + 1;
        const style = RANK_STYLES[rank];

        return (
          <Link
            key={c.id}
            href={`/repos/${repoOwner}/${repoName}/${c.username}`}
            className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2.5 transition-colors group"
          >
            {/* Rank badge */}
            <div className="w-8 text-center shrink-0">
              {style ? (
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-sm font-black ${style.badge}`}>
                  {rank}
                </span>
              ) : (
                <span className="text-sm font-bold text-zinc-600">{rank}</span>
              )}
            </div>

            {/* Avatar */}
            <div className={style ? `rounded-full ${style.ring}` : ''}>
              <Avatar src={c.avatarUrl} name={c.username} size={36} />
            </div>

            {/* Name + role */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white truncate">{c.username}</span>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{c.role}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                <span className="text-emerald-400">{c.prsMerged} merged</span>
                <span className="text-blue-400">{c.reviews} reviews</span>
                <span className="text-zinc-400">{c.commits} commits</span>
                {c.currentStreak > 0 && (
                  <span className="text-orange-400">🔥 {c.currentStreak}d</span>
                )}
              </div>
            </div>

            {/* Velocity sparkline */}
            <div className="hidden sm:block shrink-0" title="8-week velocity">
              <VelocityBars values={c.velocity} />
            </div>

            {/* Impact score */}
            <div className="text-right shrink-0">
              <div className="text-xl font-black text-indigo-400 leading-none">{c.impactScore}</div>
              <div className="text-[9px] uppercase text-zinc-600 tracking-wider">Impact</div>
            </div>

            {/* Collaboration score */}
            {c.collaborationScore > 0 && (
              <div className="hidden md:block text-right shrink-0 w-14">
                <div className="text-sm font-bold text-emerald-400 leading-none">{c.collaborationScore}%</div>
                <div className="text-[9px] uppercase text-zinc-600 tracking-wider">Collab</div>
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
