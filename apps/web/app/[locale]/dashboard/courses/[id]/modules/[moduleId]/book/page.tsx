import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { BRAND } from '@/lib/constants/brand';

// =====================================================================
// /dashboard/courses/[id]/modules/[moduleId]/book — Sprint 3.6
// §6.1 retirement.
//
// The v1 page read from the v1 `modules` and `enrollments`
// tables (dropped in Sprint 3.5) and embedded a per-module
// Calendly link. The retirement redirects the URL to
// /dashboard/sessions, which is the v2 student dashboard
// where the v2 session-grant purchase flow lives.
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

export default async function ModuleBookRedirectPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; moduleId: string }>;
}): Promise<never> {
  const { locale, id: _courseId, moduleId: _moduleId } = await params;
  setRequestLocale(locale);
  if (!isLocale(locale)) {
    redirect('/');
  }
  redirect(`/${locale}/dashboard/sessions`);
}
