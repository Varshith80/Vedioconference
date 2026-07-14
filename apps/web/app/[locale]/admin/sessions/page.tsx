import type { Metadata } from 'next';
import { CalendarRange } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllSessions, getAllChapters } from '@/services/admin/catalog';
import { AdminListPage } from '@/components/admin/admin-list-page';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.sessions' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin/sessions` },
    robots: { index: false, follow: false },
  };
}

// Format an integer cents amount as "12,34" (en-US style
// with 2 fraction digits). The page is read-only — a future
// sprint will add the edit form.
function formatCents(cents: number | null): string {
  if (cents == null) return '';
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function AdminSessionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.sessions');
  const tCommon = await getTranslations('Admin.common');
  const [sessions, chapters] = await Promise.all([
    getAllSessions(),
    getAllChapters(),
  ]);

  const chapterById = new Map(chapters.map((ch) => [ch.id, ch.title]));

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<CalendarRange className="h-6 w-6" aria-hidden={true} />}
      items={sessions}
      getKey={(s) => s.id}
      columns={[
        { key: 'title',  label: t('columns.title') },
        { key: 'slug',   label: t('columns.slug') },
        { key: 'chap',   label: t('columns.chapter') },
        { key: 'pos',    label: t('columns.position') },
        { key: 'dur',    label: t('columns.duration') },
        { key: 'price',  label: t('columns.price') },
        { key: 'pub',    label: t('columns.published') },
        { key: 'prev',   label: t('columns.preview') },
      ]}
      renderItem={(s) => (
        <>
          <span className="font-medium text-foreground">{s.title}</span>
          <span className="font-mono text-xs text-muted-foreground">{s.slug}</span>
          <span className="text-xs text-muted-foreground">
            {chapterById.get(s.chapter_id) ?? tCommon('na')}
          </span>
          <span className="text-xs text-muted-foreground">{s.position}</span>
          <span className="text-xs text-muted-foreground">
            {s.duration_min != null ? `${s.duration_min} min` : tCommon('na')}
          </span>
          <span className="text-xs tabular-nums text-foreground">
            {s.price_cents == null ? (
              <span className="italic text-muted-foreground">{t('priceTbd')}</span>
            ) : (
              formatCents(s.price_cents)
            )}
          </span>
          <span className="text-xs">
            {s.is_published ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {tCommon('yes')}
              </span>
            ) : (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {tCommon('no')}
              </span>
            )}
          </span>
          <span className="text-xs">
            {s.is_preview ? (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                {tCommon('yes')}
              </span>
            ) : (
              <span className="text-muted-foreground">{tCommon('no')}</span>
            )}
          </span>
        </>
      )}
    />
  );
}
