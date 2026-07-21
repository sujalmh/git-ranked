import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

// Edge runtime removed to avoid 1MB size limit from bundled TTF fonts

// ─── Colours matching the actual Leaderboard component ───────────────────────
const BG = '#000000';
const SURFACE = '#000000';
const BORDER_SUBTLE = '#27272a'; // zinc-800
const TEXT = '#ffffff';
const MUTED = '#71717a';  // zinc-500
const MUTED2 = '#52525b'; // zinc-600
const ACCENT = '#ccff00';

const MEDAL = {
  1: { colour: '#ffd700', label: '#1 GOLD',   tier: 'GOLD'   },
  2: { colour: '#c0c0c0', label: '#2 SILVER', tier: 'SILVER' },
  3: { colour: '#cd7f32', label: '#3 BRONZE', tier: 'BRONZE' },
} as const;

type ContributorSlim = {
  username: string;
  avatarUrl: string | null;
  impactScore: number;
  workArea: string;
  workAreaChip: { text: string; bg: string; border: string };
  rank: number;
  streak: number;
  breakdown: Array<{ hex: string; pct: number }>;
  glowHex: string;
};

// ─── Sub-components (Satori: only flexbox, inline styles, no grid) ────────────

function CrownIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.518l4.276 3.664a1 1 0 0 0 1.516-.294z" />
      <path d="M5 21h14" />
    </svg>
  );
}

function GitBranchIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function FlameIcon({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

function StreakBadge({ days }: { days: number }) {
  if (days <= 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontWeight: 700,
        color: '#fdba74', // orange-300
        background: 'rgba(249,115,22,0.1)', // orange-500/10
        border: '1px solid rgba(249,115,22,0.2)', // orange-500/20
        borderRadius: 99,
        padding: '2px 6px',
      }}
    >
      <FlameIcon color="#fdba74" />
      {days}d
    </div>
  );
}

function PodiumCard({ c }: { c: ContributorSlim }) {
  const medal = MEDAL[c.rank as 1 | 2 | 3];
  const colour = medal.colour;
  const isGold = c.rank === 1;
  const isSilver = c.rank === 2;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        border: `2px solid ${colour}`,
        background: SURFACE,
        padding: isGold ? '16px' : isSilver ? '14px' : '12px',
        gap: isGold ? 12 : isSilver ? 10 : 8,
        boxShadow: `2px 2px 16px 0 ${colour}66`,
        position: 'relative',
      }}
    >
      {/* Medal label + crown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {isGold && <CrownIcon color={colour} size={24} />}
        <span style={{ fontSize: isGold ? 16 : isSilver ? 14 : 12, fontWeight: 700, color: colour, letterSpacing: '0.025em', textTransform: 'uppercase' }}>
          {medal.label}
        </span>
      </div>

      {/* Avatar */}
      <div
        style={{
          display: 'flex',
          padding: 2,
          background: SURFACE, // simulates ring-offset-black
          border: `2px solid ${colour}99`, // simulates ring-[#colour]/60
        }}
      >
        {c.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.avatarUrl}
            width={isGold ? 64 : isSilver ? 52 : 44}
            height={isGold ? 64 : isSilver ? 52 : 44}
            style={{ objectFit: 'cover' }}
            alt={c.username}
          />
        ) : (
          <div style={{ width: isGold ? 64 : isSilver ? 52 : 44, height: isGold ? 64 : isSilver ? 52 : 44, background: 'rgba(255,255,255,0.1)' }} />
        )}
      </div>

      {/* Username */}
      <span style={{ fontSize: isGold ? 18 : isSilver ? 16 : 14, fontWeight: 700, color: TEXT }}>
        {c.username}
      </span>

      {/* Work area chip */}
      <span style={{
        fontSize: isGold ? 14 : 12,
        fontWeight: 500,
        color: c.workAreaChip.text,
        background: c.workAreaChip.bg,
        border: `1px solid ${c.workAreaChip.border}`,
        borderRadius: 99,
        padding: isGold ? '2px 8px' : '2px 6px',
      }}>
        {c.workArea}
      </span>

      {/* Score */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 0, marginTop: 4 }}>
        <span style={{ fontSize: isGold ? 30 : isSilver ? 26 : 22, fontWeight: 700, color: TEXT, lineHeight: 1 }}>{c.impactScore}</span>
        <span style={{ fontSize: isGold ? 16 : isSilver ? 14 : 12, color: MUTED2, marginLeft: 2, fontWeight: 500 }}>/100</span>
      </div>

      {/* Streak */}
      {c.streak > 0 && <StreakBadge days={c.streak} />}
    </div>
  );
}

function CompactRow({ c }: { c: ContributorSlim }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        border: `1px solid ${c.glowHex}`, // Neon colored border matching UI
        background: SURFACE,
        padding: '8px 12px 8px 16px', // py-2 pr-3 pl-4
        boxShadow: `2px 2px 12px 0 ${c.glowHex}40`, // Stronger neon glow
      }}
    >
      {/* Rank */}
      <span style={{ width: 32, textAlign: 'center', fontSize: 20, fontWeight: 700, color: MUTED, flexShrink: 0 }}>
        {c.rank}
      </span>

      {/* Avatar */}
      <div style={{ border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexShrink: 0 }}>
        {c.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.avatarUrl}
            width={28}
            height={28}
            style={{ objectFit: 'cover' }}
            alt={c.username}
          />
        ) : (
          <div style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.1)' }} />
        )}
      </div>

      {/* Username */}
      <span style={{ flex: 1, fontSize: 16, fontWeight: 500, color: TEXT }}>{c.username}</span>

      {/* Streak */}
      {c.streak > 0 && <StreakBadge days={c.streak} />}

      {/* Score */}
      <div style={{ display: 'flex', alignItems: 'baseline', width: 48, justifyContent: 'flex-end', flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>{c.impactScore}</span>
        <span style={{ fontSize: 14, color: MUTED2, marginLeft: 2, fontWeight: 500 }}>/100</span>
      </div>
    </div>
  );
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  const { owner, name } = await params;
  const url = new URL(req.url);

  let fontMediumData: ArrayBuffer | null = null;
  let fontBoldData: ArrayBuffer | null = null;
  
  try {
    const mediumRes = await fetch(new URL('/fonts/Inter-Medium.ttf', url.origin));
    const boldRes = await fetch(new URL('/fonts/Inter-Bold.ttf', url.origin));
    if (mediumRes.ok) fontMediumData = await mediumRes.arrayBuffer();
    if (boldRes.ok) fontBoldData = await boldRes.arrayBuffer();
  } catch (err) {
    console.warn('Failed to fetch local fonts for OG route', err);
  }

  let contributors: ContributorSlim[] = [];
  try {
    const raw = url.searchParams.get('data');
    if (raw) contributors = JSON.parse(decodeURIComponent(raw));
  } catch { /* fallback to empty */ }

  const top3 = contributors.filter((c) => c.rank <= 3);
  const rest  = contributors.filter((c) => c.rank > 3);

  const W = 1200;
  // Dynamically calculate height to fit up to 6 compact rows (9 total)
  const headerFooterH = 180;
  const podiumH = top3.length > 0 ? 300 : 0;
  const restH = rest.length > 0 ? (rest.length * 60 + 20) : 0;
  const H = Math.max(400, headerFooterH + podiumH + restH);

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          background: BG,
          display: 'flex',
          flexDirection: 'column',
          padding: 40,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <CrownIcon color="#fbbf24" size={24} />
          <span style={{ fontSize: 28, fontWeight: 700, color: TEXT, letterSpacing: -0.5 }}>Leaderboard</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
            <GitBranchIcon color={MUTED} size={16} />
            <span style={{ fontSize: 16, color: MUTED }}>
              {owner}/{name}
            </span>
          </div>
          <div style={{ display: 'flex', flex: 1, justifyContent: 'flex-end' }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: ACCENT,
              background: `${ACCENT}22`,
              border: `1px solid ${ACCENT}44`,
              padding: '4px 12px',
              letterSpacing: 1,
            }}>
              GITRANKED
            </span>
          </div>
        </div>

        {/* ── Podium ── */}
        {top3.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: rest.length > 0 ? 20 : 0 }}>
            {/* Reorder to [Silver, Gold, Bronze] */}
            {(() => {
              const ordered = [];
              if (top3.length > 1) ordered.push(top3[1]);
              if (top3.length > 0) ordered.push(top3[0]);
              if (top3.length > 2) ordered.push(top3[2]);
              return ordered.map((c) => <PodiumCard key={c.username} c={c} />);
            })()}
          </div>
        )}

        {/* ── Compact rows (4-6) ── */}
        {rest.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rest.map((c) => <CompactRow key={c.username} c={c} />)}
          </div>
        )}

        {/* ── Footer ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 'auto',
            paddingTop: 18,
            borderTop: `1px solid ${BORDER_SUBTLE}`,
          }}
        >
          <span style={{ fontSize: 12, color: MUTED }}>Ranked by impact score · GitRanked</span>
          <span style={{ fontSize: 12, color: MUTED }}>gitranked.dev</span>
        </div>
      </div>
    ),
    { 
      width: W, 
      height: H,
      fonts: fontMediumData && fontBoldData ? [
        { name: 'Inter', data: fontMediumData, weight: 500, style: 'normal' },
        { name: 'Inter', data: fontBoldData, weight: 700, style: 'normal' },
      ] : undefined
    }
  );
}
