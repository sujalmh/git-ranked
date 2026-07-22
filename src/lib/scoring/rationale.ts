import type { Facts, Rationale, ReviewFacts, WorkType } from './types';

export function buildRationale(
  facts: Facts | ReviewFacts,
  workType: WorkType
): Rationale {
  if (workType === 'Review') {
    const rf = facts as ReviewFacts;
    let impactReason = `${rf.substantiveness} code review`;
    if (rf.blocking_issue_found) {
      impactReason += rf.confirmed_valid
        ? ' that caught a critical issue'
        : ' that raised a potential issue';
    } else {
      impactReason += ' providing peer feedback';
    }

    let qualityReason = `Review depth: ${rf.substantiveness}`;
    if (rf.blocking_issue_found && rf.confirmed_valid) {
      qualityReason += ' (verified defect detection)';
    }

    return {
      impact_reason: impactReason + '.',
      quality_reason: qualityReason + '.',
    };
  }

  const gf = facts as Facts;
  const impactParts: string[] = [`${capitalize(gf.scope)} scope ${workType.toLowerCase()}`];

  if (gf.user_visible) impactParts.push('user-facing changes');
  if (gf.breaking_change) impactParts.push('breaking changes');
  if (gf.cross_cutting) impactParts.push('cross-cutting architecture');
  if (gf.new_algorithm_or_subsystem) impactParts.push('new algorithm/subsystem');

  const impact_reason = impactParts.join(' with ') + '.';

  const qualityParts: string[] = [];
  if (gf.testing_added && gf.documentation_updated) {
    qualityParts.push('Includes automated tests and updated documentation');
  } else if (gf.testing_added) {
    qualityParts.push('Includes automated tests');
  } else if (gf.documentation_updated) {
    qualityParts.push('Includes updated documentation');
  }

  if (gf.boilerplate) {
    qualityParts.push('boilerplate implementation');
  } else if (qualityParts.length === 0) {
    qualityParts.push('Standard execution');
  }

  const quality_reason = qualityParts.join(', ') + '.';

  return {
    impact_reason,
    quality_reason,
  };
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ');
}
