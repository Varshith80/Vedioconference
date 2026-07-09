import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireProfile } from '@/hooks/use-require-user';
import { defaultLocale, isLocale, type Locale } from '@/i18n';

// Sprint B1 placeholder: opt out of static generation because
// `requireProfile` reads the Supabase session cookie.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) redirect(`/${defaultLocale}/auth/login`);
  setRequestLocale(locale);
  const profile = await requireProfile();
  // The Database type is permissive (Record<string, unknown>) until
  // `pnpm db:types` runs; assert the public columns we need.
  const { role } = profile as unknown as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    const h = await headers();
    const active = (h.get('x-next-intl-locale') ?? locale) as Locale;
    redirect(`/${active}/dashboard`);
  }
  return <>{children}</>;
}
