import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { getAllStudents } from '@/services/admin/catalog';
import { AdminListPage } from '@/components/admin/admin-list-page';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.students' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin/students` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminStudentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.students');
  const tCommon = await getTranslations('Admin.common');
  const students = await getAllStudents();

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<Users className="h-6 w-6" aria-hidden={true} />}
      items={students}
      getKey={(s) => String(s.id)}
      columns={[
        { key: 'name',  label: t('columns.name') },
        { key: 'email', label: t('columns.email') },
        { key: 'created',  label: t('columns.created') },
        { key: 'lastLogin', label: t('columns.lastLogin') },
      ]}
      renderItem={(s) => {
        const row = s as {
          id: string;
          full_name?: string | null;
          email?: string | null;
          created_at?: string | null;
          last_login_at?: string | null;
        };
        return (
          <>
            <span className="font-medium text-foreground">
              {row.full_name ?? tCommon('na')}
            </span>
            <span className="text-xs text-muted-foreground">
              {row.email ?? tCommon('na')}
            </span>
            <span className="text-xs text-muted-foreground">
              {row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : tCommon('na')}
            </span>
            <span className="text-xs text-muted-foreground">
              {row.last_login_at ? new Date(row.last_login_at).toISOString().slice(0, 10) : tCommon('na')}
            </span>
          </>
        );
      }}
    />
  );
}
