import type { Metadata } from 'next';
import { School } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllPrograms } from '@/services/admin/catalog';
import { safeAdminFetch } from '@/services/admin/admin-fetch';
import { AdminListPage } from '@/components/admin/admin-list-page';
import { ProgramRowActions } from '@/components/admin/program-row-actions';
import { ProgramCreateTrigger } from '@/components/admin/program-create-trigger';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.programs' });
  return {
    title: `${t('title')} — CoursEnLigne`,
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
  const programs = await safeAdminFetch(getAllPrograms, 'admin.getAllPrograms');

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<School className="h-6 w-6" aria-hidden={true} />}
      result={programs}
      labels={{
        loading: tCommon('loading'),
        loadErrorTitle: tCommon('loadErrorTitle'),
        retry: tCommon('retry'),
      }}
      items={programs.state === 'data' ? programs.data : []}
      getKey={(p) => p.id}
      interactiveActions
      headerAction={<ProgramCreateTrigger />}
      actions={(p) => (
        <ProgramRowActions
          programId={p.id}
          slug={p.slug}
          title={p.title}
        />
      )}
      columns={[
        { key: 'title', label: t('columns.title'), width: 'min-w-[280px]' },
        { key: 'pub',   label: t('columns.status'), width: 'w-32' },
      ]}
      renderItem={(p) => (
        <>
          <span className="font-medium text-foreground">{p.title}</span>
          <span className="text-xs">
            {p.is_published ? (
              <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {t('status.published')}
              </span>
            ) : (
              <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {t('status.draft')}
              </span>
            )}
          </span>
        </>
      )}
    />
  );
}
