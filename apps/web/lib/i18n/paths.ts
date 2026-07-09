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
 * The translator parameter is typed loosely (`Translator` from
 * next-intl) because next-intl's type-level guarantee is that
 * `t(key)` returns a `string`; for keys whose value is an object
 * or an array, the runtime returns the object/array but the
 * static type still says `string`. We cast at the boundary.
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
 * Minimal translator shape — anything callable with a string key.
 * Compatible with both `getTranslations` (RSC) and `useTranslations`
 * (client) return values.
 */
export type TLike = (key: string, values?: Record<string, string | number | Date>) => unknown;

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
  return asArray<LocalisedLearningPath>(t('paths'));
}

export function getMethodSteps(t: TLike): ReadonlyArray<LocalisedMethodStep> {
  return asArray<LocalisedMethodStep>(t('steps'));
}

export function getKeyFigures(t: TLike): ReadonlyArray<LocalisedKeyFigure> {
  return asArray<LocalisedKeyFigure>(t('figures'));
}
