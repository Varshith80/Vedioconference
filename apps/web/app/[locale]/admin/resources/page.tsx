import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { listAllResources } from '@/services/resources';
import { AdminListPage } from '@/components/admin/admin-list-page';
import { ResourceCreateTrigger } from '@/components/admin/resource-create-trigger';
import { ResourceDeleteButton } from '@/components/admin/resource-delete-button';

// =====================================================================
// Sprint 8 — /admin/resources (R-2 admin surface). List every
// resource (any visibility), newest first. The admin creates
// resources via the dialog trigger and deletes them via the
// per-row trash button.
//
// The page is intentionally read-light: no per-resource counts
// (the platform does not yet write `resource_grants` — the
// v1→v2 retirement left the join as forward-compatibility).
// When a follow-up storage-upload slice lands, a "Used by N
// students" column can be added.
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.resources' });
  return {
    title: `${t('title')} — Intégrale`,
    alternates: { canonical: `/${locale}/admin/resources` },
    robots: { index: false, follow: false },
  };
}

const FORMAT_YEAR_MONTH_DAY = (iso: string): string => iso.slice(0, 10);

function visibilityBadgeClass(visibility: string): string {
  switch (visibility) {
    case 'public':
      return 'rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'enrolled':
      return 'rounded-full bg-sky-100 px-2 py-0.5 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
    case 'private':
      return 'rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
    default:
      return 'rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
  }
}

export default async function AdminResourcesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  await requireAdmin();

  const t = await getTranslations('Admin.resources');

  const resources = await listAllResources();

  return (
    <AdminListPage
      title={t('title')}
      subline={t('subline')}
      empty={t('empty')}
      emptyIcon={<FileText className="h-6 w-6" aria-hidden={true} />}
      items={resources}
      getKey={(r) => r.id}
      interactiveActions
      headerAction={<ResourceCreateTrigger />}
      actions={(r) => (
        <div className="flex items-center gap-1">
          <ResourceDeleteButton resourceId={r.id} title={r.title} />
        </div>
      )}
      columns={[
        { key: 'title', label: t('columns.title'), width: 'min-w-[240px]' },
        { key: 'file', label: t('columns.fileName'), width: 'min-w-[200px]' },
        { key: 'visibility', label: t('columns.visibility'), width: 'w-32' },
        { key: 'created', label: t('columns.createdAt'), width: 'w-32' },
      ]}
      renderItem={(r) => {
        return (
          <>
            <span className="flex flex-col text-xs">
              <span className="font-medium text-foreground">{r.title}</span>
              {r.description ? (
                <span className="line-clamp-1 text-muted-foreground">
                  {r.description}
                </span>
              ) : null}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {r.fileName}
            </span>
            <span className="text-xs">
              <span className={visibilityBadgeClass(r.visibility)}>
                {t(`visibility.${r.visibility}` as 'visibility.public')}
              </span>
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {FORMAT_YEAR_MONTH_DAY(r.createdAt)}
            </span>
          </>
        );
      }}
    />
  );
}