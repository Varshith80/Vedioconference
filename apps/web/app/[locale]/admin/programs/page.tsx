import type { Metadata } from 'next';
import { School } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllPrograms } from '@/services/admin/catalog';
import { AdminListPage } from '@/components/admin/admin-list-page';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.programs' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin/programs` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminProgramsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.programs');
  const tCommon = await getTranslations('Admin.common');
  const programs = await getAllPrograms();

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<School className="h-6 w-6" aria-hidden={true} />}
      items={programs}
      getKey={(p) => p.id}
      columns={[
        { key: 'title',    label: t('columns.title') },
        { key: 'slug',     label: t('columns.slug') },
        { key: 'sort',     label: t('columns.sortOrder') },
        { key: 'pub',      label: t('columns.published') },
        { key: 'created',  label: t('columns.createdAt') },
      ]}
      renderItem={(p) => (
        <>
          <span className="font-medium text-foreground">{p.title}</span>
          <span className="font-mono text-xs text-muted-foreground">{p.slug}</span>
          <span className="text-xs text-muted-foreground">{p.sort_order}</span>
          <span className="text-xs">
            {p.is_published ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {tCommon('yes')}
              </span>
            ) : (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {tCommon('no')}
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(p.created_at).toISOString().slice(0, 10)}
          </span>
        </>
      )}
    />
  );
}
