import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { PageHeader } from '@/components/shared/page-header';
import { Heading } from '@/components/shared/heading';
import { CtaBand } from '@/components/marketing/cta-band';
import { getCourseWithChapters } from '@/services/curriculum/courses';
import { getChapterWithSessions } from '@/services/curriculum/chapters';
import { BRAND } from '@/lib/constants/brand';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export async function generateMetadata(
  {
    params,
  }: { params: Promise<{ slug: string; chapterSlug: string; locale: string }> },
): Promise<Metadata> {
  const { slug, chapterSlug, locale } = await params;
  const course = await getCourseWithChapters(slug);
  const chapter = course
    ? (await getChapterWithSessions(course.id, chapterSlug))
    : null;
  if (!chapter || !course) {
    return { title: 'Not found' };
  }
  return {
    title: `${chapter.title} · ${course.title} — ${BRAND.name}`,
    description: chapter.description ?? course.subtitle ?? course.description ?? '',
    alternates: {
      canonical: `/${locale}/courses/${slug}/chapters/${chapterSlug}`,
    },
  };
}

/**
 * `/[locale]/courses/[slug]/chapters/[chapterSlug]` — the public
 * chapter detail page. Lists the chapter's published sessions
 * with a "Buy this session" link per session. The session links
 * go to `/[locale]/sessions/[id]`, which renders the public
 * session detail and triggers the Stripe Checkout flow.
 */
export default async function ChapterPage(
  { params }: { params: Promise<{ slug: string; chapterSlug: string; locale: string }> },
) {
  const { slug, chapterSlug, locale } = await params;
  setRequestLocale(locale);

  const course = await getCourseWithChapters(slug);
  if (!course) notFound();

  const chapter = await getChapterWithSessions(course.id, chapterSlug);
  if (!chapter) notFound();

  const t = await getTranslations({ locale, namespace: 'Chapters' });
  const tSessions = await getTranslations({ locale, namespace: 'Sessions' });

  return (
    <>
      <PageHeader
        title={chapter.title}
        description={
          chapter.description ??
          (locale === 'fr'
            ? 'Sessions de ce chapitre'
            : 'Sessions in this chapter')
        }
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Courses', href: `/${locale}/courses` },
          { label: course.title, href: `/${locale}/courses/${slug}` },
          { label: chapter.title },
        ]}
      />

      <Section spacing="default">
        <Container>
          <Heading level="h2" className="text-2xl sm:text-3xl">
            {t('title')}
          </Heading>
          {chapter.sessions.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {t('noSessions')}
            </p>
          ) : (
            <ul role="list" className="mt-6 flex flex-col gap-3">
              {chapter.sessions.map((s) => {
                const priceKnown = s.price_cents != null;
                return (
                  <li
                    key={s.id}
                    className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {tSessions('title')} {s.position} · {s.title}
                      </p>
                      {s.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {s.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {priceKnown ? (
                        <a
                          href={`/${locale}/sessions/${s.id}`}
                          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {tSessions('buy')}
                        </a>
                      ) : (
                        <span
                          aria-disabled="true"
                          title="The price for this session will be available soon."
                          className="inline-flex cursor-not-allowed items-center justify-center rounded-md bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground"
                        >
                          {tSessions('priceTbd')}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Container>
      </Section>

      <CtaBand
        title={locale === 'fr' ? 'Une question ?' : 'Have a question?'}
        description={locale === 'fr'
          ? 'Contactez-nous pour en savoir plus.'
          : 'Get in touch to learn more.'}
        primaryHref="/contact"
        primaryLabel={locale === 'fr' ? 'Nous contacter' : 'Contact us'}
      />
    </>
  );
}
