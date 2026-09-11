import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import {
  getAllGrades,
  getAllPrograms,
  getCourseById,
} from '@/services/admin/catalog';
import { CourseEditForm } from '@/components/admin/course-edit-form';

// =====================================================================
// Sprint 3.8 — /admin/courses/[id] (edit page). Mirrors the
// /admin/programs/[id] and /admin/grades/[id] pages.
// =====================================================================

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Admin.courseEdit' });
  return {
    title: `${t('title')} — CoursEnLigne`,
    alternates: { canonical: `/${locale}/admin/courses` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminCourseEditPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return <></>;
  setRequestLocale(locale);
  await requireAdmin();

  const [row, programs, grades] = await Promise.all([
    getCourseById(id),
    getAllPrograms(),
    getAllGrades(),
  ]);
  if (!row) notFound();

  const programSlug = (() => {
    const pid = row.program_id as string | undefined;
    return programs.find((p) => p.id === pid)?.slug ?? '';
  })();
  const gradeSlug = (() => {
    const gid = row.grade_id as string | undefined;
    if (!gid) return null;
    return grades.find((g) => g.id === gid)?.slug ?? null;
  })();

  const initial = {
    title: typeof row.title === 'string' ? row.title : '',
    slug: typeof row.slug === 'string' ? row.slug : '',
    subtitle: typeof row.subtitle === 'string' ? (row.subtitle as string) : null,
    description: typeof row.description === 'string' ? (row.description as string) : null,
    program_slug: programSlug,
    grade_slug: gradeSlug,
    is_published: Boolean(row.is_published),
  };

  const programOptions = programs.map((p) => ({ value: p.slug, label: p.title }));
  const gradeOptions = grades.map((g) => ({
    value: g.slug,
    label: g.title,
    programSlug: programs.find((p) => p.id === g.program_id)?.slug ?? '',
  }));

  return (
    <div className="container py-8 sm:py-12">
      <CourseEditForm
        courseId={id}
        initial={initial}
        programs={programOptions}
        grades={gradeOptions}
      />
    </div>
  );
}
