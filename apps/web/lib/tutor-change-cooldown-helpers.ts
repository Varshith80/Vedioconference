// =====================================================================
// Sprint 6.5 — Feature G cooldown pure helpers (client-safe).
//
// Mirrors the helpers in `services/student/tutor-change-cooldown.ts`.
// The pure formatting / date helpers are re-exported from here so
// client components can use them without importing the server-only
// service module (which would crash the build).
//
// The service module's helpers are authoritative — the two are
// kept in lock-step via the unit tests at
// `apps/web/tests/unit/tutor-change-cooldown.test.ts`.
// =====================================================================

/** 24 hours, in milliseconds. */
export const COOLDOWN_HOURS_MS = 24 * 60 * 60 * 1000;

/** Locales supported for `formatCooldownRemaining`. */
type CooldownLocale = 'en' | 'fr';

/**
 * Pure helper. True if the most-recent event is within the
 * cooldown window relative to `now`. False when there is no
 * recorded event at all.
 */
export function isInCooldown(
  lastChangedAt: Date | string | null,
  now: Date = new Date(),
): boolean {
  if (!lastChangedAt) return false;
  const t =
    typeof lastChangedAt === 'string'
      ? new Date(lastChangedAt)
      : lastChangedAt;
  return now.getTime() - t.getTime() < COOLDOWN_HOURS_MS;
}

/**
 * Pure helper. When does the cooldown end? `lastChangedAt` must
 * be a valid date; the caller is responsible for not calling this
 * on a null value (use `isInCooldown` first to guard).
 */
export function nextEligibleAt(lastChangedAt: Date | string): Date {
  const t =
    typeof lastChangedAt === 'string'
      ? new Date(lastChangedAt)
      : lastChangedAt;
  if (Number.isNaN(t.getTime())) {
    throw new Error('Invalid lastChangedAt.');
  }
  return new Date(t.getTime() + COOLDOWN_HOURS_MS);
}

/**
 * Pure helper. Format a remaining-ms duration as a short human
 * string. EN or FR. Minutes are rounded up so the user never sees
 * "0 min" while still in cooldown.
 */
export function formatCooldownRemaining(
  remainingMs: number,
  locale: CooldownLocale = 'en',
): string {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  if (locale === 'fr') {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes - hours * 60;
    if (hours < 24) return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours - days * 24;
    return remainingHours === 0 ? `${days} j` : `${days} j ${remainingHours} h`;
  }
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes - hours * 60;
  if (hours < 24) return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours - days * 24;
  return remainingHours === 0 ? `${days} d` : `${days} d ${remainingHours} h`;
}
