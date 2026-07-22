export function decayWeight(
  shippedAt: Date | string | null | undefined,
  asOf: Date | string = new Date(),
  halfLifeDays: number = 60
): number {
  if (!shippedAt) return 1.0;
  const shippedDate = typeof shippedAt === 'string' ? new Date(shippedAt) : shippedAt;
  const asOfDate = typeof asOf === 'string' ? new Date(asOf) : asOf;

  const shippedMs = shippedDate.getTime();
  const asOfMs = asOfDate.getTime();

  if (!Number.isFinite(shippedMs) || !Number.isFinite(asOfMs)) {
    return 1.0;
  }

  const ageMs = Math.max(0, asOfMs - shippedMs);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  return Math.exp(-ageDays / halfLifeDays);
}
