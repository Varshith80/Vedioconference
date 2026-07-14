import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { BRAND } from '@/lib/constants/brand';

// =====================================================================
// /dashboard/courses/[id] — Sprint 3.6 §6.1 retirement.
//
// The v1 page read from the `modules` + `module_progress` tables
// (dropped in Sprint 3.5) and rendered the v1 module-based
// progress UI. The retirement redirects the URL to
// /dashboard/sessions, which is the v2 student dashboard.
// The redirect is a 307 (Next.js default) so search engines
// and any in-flight link-shares keep their query string.
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Dashboard.sessions' });
  return {
    title: `${t('title')} — ${BRAND.name}`,
    alternates: { canonical: `/${locale}/dashboard/sessions` },
    robots: { index: false, follow: false },
  };
}

export default async function DashboardCourseRedirectPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<never> {
  const { locale, id: _courseId } = await params;
  setRequestLocale(locale);
  if (!isLocale(locale)) {
    // Defensive: middleware would normally 404 an unknown
    // locale, but if the layout is bypassed, send to root.
    redirect('/');
  }
  redirect(`/${locale}/dashboard/sessions`);
}
