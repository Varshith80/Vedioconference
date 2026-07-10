/**
 * Localised learning-paths / method-steps / key-figures helpers.
 *
 * The four learning paths (`lycee`, `prepa`, `bts`, `licence`),
 * the three method bricks (`01`, `02`, `03`), and the three key
 * figures are content, not constants. They live in
 * `messages/<locale>.json` under the `Homepage` namespace and are
 * read via these helpers.
 *
 * The *ids* (`lycee | prepa | bts | licence`) are locale-agnostic
 * — they are the stable handle used in URLs, analytics, and DB
 * foreign keys. The `LearningPathId` type is exported from here and
 * re-exported from the marketing components.
 *
 * The translator parameter is typed loosely because next-intl's
 * type-level guarantee is that `t(key)` returns a `string`; for
 * keys whose value is an object or an array, the static type
 * still says `string`. We cast at the boundary.
 *
 * IMPORTANT: arrays must be read with `t.raw(key)`, not `t(key)`.
 * The next-intl runtime throws `IntlError: INVALID_MESSAGE` when
 * `t(key)` resolves to a non-string (a value next-intl considers
 * un-formattable). `t.raw(key)` returns the underlying object or
 * array as-is.
 */
import type { LearningPathId } from '@/lib/constants/brand';

export type LocalisedLearningPath = {
  id: LearningPathId;
  level: string;
  badge: string;
  headline: string;
  blurb: string;
  subjects: string;
};

export type LocalisedMethodStep = {
  n: '01' | '02' | '03';
  title: string;
  body: string;
};

export type LocalisedKeyFigure = {
  value: string;
  label: string;
};

/**
 * Minimal translator shape — anything callable with a string key
 * that ALSO has a `.raw()` accessor. Compatible with both
 * `getTranslations` (RSC) and `useTranslations` (client) return
 * values.
 */
export type TLike = {
  (key: string, values?: Record<string, string | number | Date>): string;
  raw: (key: string) => unknown;
};

/**
 * Runtime helper: turn whatever the translator returns for a given
 * key into a typed `ReadonlyArray<T>`. Returns `[]` for any non-array
 * value (e.g. when the key is missing in the active locale's JSON).
 */
export function asArray<T>(value: unknown): ReadonlyArray<T> {
  return Array.isArray(value) ? (value as ReadonlyArray<T>) : [];
}

/**
 * Read the four learning paths from the active locale's
 * `Homepage.paths` array. The shape is validated at runtime by
 * TypeScript's `as` cast — the JSON file is the contract.
 */
export function getLearningPaths(t: TLike): ReadonlyArray<LocalisedLearningPath> {
  return asArray<LocalisedLearningPath>(t.raw('paths'));
}

export function getMethodSteps(t: TLike): ReadonlyArray<LocalisedMethodStep> {
  return asArray<LocalisedMethodStep>(t.raw('steps'));
}

export function getKeyFigures(t: TLike): ReadonlyArray<LocalisedKeyFigure> {
  return asArray<LocalisedKeyFigure>(t.raw('figures'));
}

// ─── Homepage marketing arrays ────────────────────────────────────────────

export type LocalisedTrustItem = string;

export type LocalisedFeaturedTutor = {
  slug: string;
  name: string;
  headline: string;
  bio: string;
  rating: number;
  sessions: number;
  subjects: ReadonlyArray<string>;
};

export type CourseAccent = 'primary' | 'accent' | 'muted';

export type LocalisedPopularCourse = {
  id: string;
  slug: string;
  title: string;
  track: string;
  level: string;
  summary: string;
  duration: string;
  price: string;
  accent: CourseAccent;
};

export type BenefitIcon = 'award' | 'check' | 'calendar' | 'video' | 'card' | 'chart';

export type LocalisedBenefit = {
  icon: BenefitIcon;
  title: string;
  body: string;
};

export type LocalisedHowStep = {
  n: '01' | '02' | '03' | '04';
  title: string;
  body: string;
  detail?: string;
};

export type LocalisedTestimonial = {
  quote: string;
  author: string;
  role: string;
  rating?: number;
};

export type LocalisedFaqItem = {
  q: string;
  a: string;
};

export function getTrustItems(t: TLike): ReadonlyArray<LocalisedTrustItem> {
  return asArray<LocalisedTrustItem>(t.raw('trustItems'));
}

export function getFeaturedTutors(t: TLike): ReadonlyArray<LocalisedFeaturedTutor> {
  return asArray<LocalisedFeaturedTutor>(t.raw('tutors'));
}

export function getPopularCourses(t: TLike): ReadonlyArray<LocalisedPopularCourse> {
  return asArray<LocalisedPopularCourse>(t.raw('courses'));
}

export function getBenefits(t: TLike): ReadonlyArray<LocalisedBenefit> {
  return asArray<LocalisedBenefit>(t.raw('benefits'));
}

export function getHowSteps(t: TLike): ReadonlyArray<LocalisedHowStep> {
  return asArray<LocalisedHowStep>(t.raw('howSteps'));
}

export function getTestimonials(t: TLike): ReadonlyArray<LocalisedTestimonial> {
  return asArray<LocalisedTestimonial>(t.raw('testimonials'));
}

export function getFaqItems(t: TLike): ReadonlyArray<LocalisedFaqItem> {
  return asArray<LocalisedFaqItem>(t.raw('faqItems'));
}
