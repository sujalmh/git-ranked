import type { ContributorInsight } from '@/lib/contributor-insights';
import type { ContributorAiData } from '@/lib/analysis';
import type { EvidenceItem } from '@/lib/evidence';
import { ContributorProfileCard, type StatKey } from './ContributorProfileCard';
import type { IdentityAssignment } from './identity';
import { NEUTRAL_IDENTITY } from './identity';

export function ContributorProfiles({
  contributors,
  contributorAiMap,
  contributorEvidence,
  repoOwner,
  repoName,
  assignment,
  highlightByUser,
}: {
  contributors: ContributorInsight[];
  contributorAiMap: Map<number, ContributorAiData>;
  contributorEvidence: EvidenceItem[][];
  repoOwner: string;
  repoName: string;
  assignment: IdentityAssignment;
  highlightByUser: Map<number, Set<StatKey>>;
}) {
  const smallTeam = assignment.smallTeam;

  return (
    <div className={smallTeam ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'}>
      {contributors.map((contributor, idx) => {
        const aiData = contributorAiMap.get(contributor.id);
        const identity = assignment.colorByUserId.get(contributor.id) ?? NEUTRAL_IDENTITY;
        const borderClass = smallTeam ? `border-l-2 ${identity.border}` : 'border-white/5';
        return (
          <ContributorProfileCard
            key={contributor.id}
            contributor={contributor}
            aiData={{
              profile: aiData?.profile ?? null,
              impact: aiData?.impact ?? null,
            }}
            contributorEvidence={contributorEvidence[idx] ?? []}
            repoOwner={repoOwner}
            repoName={repoName}
            borderClass={borderClass}
            highlightStats={highlightByUser.get(contributor.id)}
          />
        );
      })}
    </div>
  );
}
