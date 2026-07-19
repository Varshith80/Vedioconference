import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getSessionById } from '@/services/admin/catalog';
import { getAllTutors } from '@/services/admin/tutors';
import { SessionEditForm } from '@/components/admin/session-edit-form';

// =====================================================================
// Sprint 3.6 §4.5 — /admin/sessions/[id] (edit page).
// Renders <SessionEditForm/> with the initial values from
// the DB. The form PATCHes /api/sessions/[id] on submit.
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.sessionEdit' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin/sessions` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminSessionEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return <></>;
  setRequestLocale(locale);

  await requireAdmin();

  // Sprint 3.8 — the assigned-tutor picker needs the full
  // tutor directory. The list is small (admin reference
  // data) and cache()-wrapped on the server.
  const [row, tutors] = await Promise.all([getSessionById(id), getAllTutors()]);
  if (!row) notFound();

  const initial = {
    title: typeof row.title === 'string' ? row.title : '',
    description: typeof row.description === 'string' ? row.description : null,
    duration_min:
      typeof row.duration_min === 'number' ? (row.duration_min as number) : null,
    price_cents:
      typeof row.price_cents === 'number' ? (row.price_cents as number) : null,
    currency: typeof row.currency === 'string' ? row.currency : 'EUR',
    calendly_event_uri:
      typeof row.calendly_event_uri === 'string'
        ? (row.calendly_event_uri as string)
        : null,
    is_published: Boolean(row.is_published),
    is_preview: Boolean(row.is_preview),
    tutor_id:
      typeof row.tutor_id === 'string' && row.tutor_id.length > 0
        ? (row.tutor_id as string)
        : null,
  };

  const tutorOptions = tutors.map((t) => ({
    value: t.id,
    label: t.full_name,
  }));

  return (
    <div className="container py-8 sm:py-12">
      <SessionEditForm sessionId={id} initial={initial} tutors={tutorOptions} />
    </div>
  );
}
