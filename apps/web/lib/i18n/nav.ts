/**
 * Localised navigation helpers.
 *
 * The primary nav and the footer nav are content, not constants.
 * The `href` values are the same in every locale (sub-paths are
 * added by the `[locale]` segment at runtime); only the labels
 * change. They live in `messages/<locale>.json` under the `Nav`
 * namespace and are read via these helpers.
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
export type PrimaryNavItem = {
  id: string;
  label: string;
  href: string;
};

export type FooterLink = {
  label: string;
  href: string;
};

/**
 * Minimal translator shape. `getTranslations` / `useTranslations`
 * return a function that ALSO has a `.raw()` method for accessing
 * structured values without ICU formatting.
 */
type TLike = {
  (key: string, values?: Record<string, string | number | Date>): string;
  raw: (key: string) => unknown;
};

function asArray<T>(value: unknown): ReadonlyArray<T> {
  return Array.isArray(value) ? (value as ReadonlyArray<T>) : [];
}

export function getPrimaryNav(t: TLike): ReadonlyArray<PrimaryNavItem> {
  return asArray<PrimaryNavItem>(t.raw('primary'));
}

export function getFooterLinks(t: TLike): ReadonlyArray<FooterLink> {
  return asArray<FooterLink>(t.raw('footer'));
}
