// Keep this pure contract identical in ClassScore and YBS; filter validity before selection.
export const creditTime = r => r?.completedAt == null ? NaN : r.completedAt instanceof Date ? r.completedAt.getTime()
  : typeof r.completedAt?.toMillis === 'function' ? r.completedAt.toMillis()
  : typeof r.completedAt === 'number' ? r.completedAt : Date.parse(r.completedAt);
export function preferCredit(next, old) {
  if (!old) return true;
  const guest = r => r.source === 'worker-guest-approved';
  if (guest(next) !== guest(old)) return !guest(next);
  const a = creditTime(next), b = creditTime(old);
  if (Number.isFinite(b) && (!Number.isFinite(a) || a < b)) return true;
  if (!Object.is(a, b)) return false;
  if (guest(next)) return String(next.approvalId) < String(old.approvalId);
  return next.source === 'legacy-unverified';
}
export function selectCredits(records) {
  const selected = new Map();
  for (const r of records) {
    const key = JSON.stringify([r.subject, r.activity, r.round]);
    if (preferCredit(r, selected.get(key))) selected.set(key, r);
  }
  return [...selected.values()];
}
