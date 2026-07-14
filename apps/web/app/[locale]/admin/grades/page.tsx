import type { Metadata } from 'next';
import { BookText } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllGrades, getAllPrograms } from '@/services/admin/catalog';
import { AdminListPage } from '@/components/admin/admin-list-page';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.grades' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin/grades` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminGradesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.grades');
  const tCommon = await getTranslations('Admin.common');
  const [grades, programs] = await Promise.all([getAllGrades(), getAllPrograms()]);

  // Build a slug -> title lookup so the page can render the
  // program name without a second roundtrip.
  const programBySlug = new Map(programs.map((p) => [p.id, p.title]));

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<BookText className="h-6 w-6" aria-hidden={true} />}
      items={grades}
      getKey={(g) => g.id}
      columns={[
        { key: 'title', label: t('columns.title') },
        { key: 'slug',  label: t('columns.slug') },
        { key: 'prog',  label: t('columns.program') },
        { key: 'sort',  label: t('columns.sortOrder') },
      ]}
      renderItem={(g) => (
        <>
          <span className="font-medium text-foreground">{g.title}</span>
          <span className="font-mono text-xs text-muted-foreground">{g.slug}</span>
          <span className="text-xs text-muted-foreground">
            {programBySlug.get(g.program_id) ?? tCommon('na')}
          </span>
          <span className="text-xs text-muted-foreground">{g.sort_order}</span>
        </>
      )}
    />
  );
}
