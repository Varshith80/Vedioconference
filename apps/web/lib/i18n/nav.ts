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
 * keys whose value is an object or an array, the runtime returns
 * the object/array but the static type still says `string`. We
 * cast at the boundary.
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

type TLike = (key: string, values?: Record<string, string | number | Date>) => unknown;

function asArray<T>(value: unknown): ReadonlyArray<T> {
  return Array.isArray(value) ? (value as ReadonlyArray<T>) : [];
}

export function getPrimaryNav(t: TLike): ReadonlyArray<PrimaryNavItem> {
  return asArray<PrimaryNavItem>(t('primary'));
}

export function getFooterLinks(t: TLike): ReadonlyArray<FooterLink> {
  return asArray<FooterLink>(t('footer'));
}
