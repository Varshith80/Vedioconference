import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Clock } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SessionCard } from '@/components/marketing/session-card';
import { CtaBand } from '@/components/marketing/cta-band';
import { BuySessionButton } from '@/components/marketing/buy-session-button';
import { getSessionWithChapter } from '@/services/curriculum/sessions';
import { getCourseById } from '@/services/curriculum/courses';
import { localizedTitle } from '@/lib/i18n/localized-title';
import { formatCents } from '@/lib/utils/format';
import { BRAND } from '@/lib/constants/brand';
import type { SessionWithChapter } from '@/types/domain';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

/**
 * Render the buy CTA. If the price is NULL, the page renders
 * a disabled button + badge. Otherwise it renders the live
 * client component that POSTs to `/api/session-grants`.
 */
function SessionBuyCta({
  session,
  locale,
}: {
  session: SessionWithChapter;
  locale: string;
}) {
  const priceKnown = session.price_cents != null;
  if (!priceKnown) {
    return (
      <div className="flex flex-col items-end gap-2">
        <Badge variant="outline" className="text-xs">Price TBD</Badge>
        <button
          type="button"
          disabled
          aria-disabled
          className="inline-flex cursor-not-allowed items-center justify-center rounded-md bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground"
        >
          Price TBD
        </button>
      </div>
    );
  }
  return (
    <BuySessionButton
      sessionId={session.id}
      checkoutPathTemplate={`/${locale}/checkout/session-grant/{id}`}
      sessionPath={`/${locale}/sessions/${session.id}`}
    />
  );
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string; locale: string }> },
): Promise<Metadata> {
  const { id, locale } = await params;
  const session = await getSessionWithChapter(id);
  if (!session) {
    const t = await getTranslations({ locale, namespace: 'Sessions' });
    return { title: t('notFoundTitle') };
  }
  // Metadata uses the localized session title so the
  // <title> reflects the active locale. The runtime app
  // never reads the FR workbook's slug alias — the import
  // is keyed on the EN canonical slug, and the localized
  // string lives in `session.metadata.titles[locale]`.
  const sessionTitle = localizedTitle(session, locale as 'en' | 'fr');
  return {
    title: `${sessionTitle} — ${BRAND.name}`,
    description: session.description ?? session.title,
    alternates: { canonical: `/${locale}/sessions/${id}` },
  };
}

/**
 * `/[locale]/sessions/[id]` — the public session detail
 * page. This is the entry point for buying a session:
 * clicking "Buy" creates a `pending_payment` `session_grant`
 * and redirects the user to Stripe Checkout. The route also
 * serves as the back-link target for the chapter detail
 * page.
 */
export default async function SessionDetailPage(
  { params }: { params: Promise<{ id: string; locale: string }> },
) {
  const { id, locale } = await params;
  setRequestLocale(locale);

  const session = await getSessionWithChapter(id);
  if (!session) notFound();

  const t = await getTranslations({ locale, namespace: 'Sessions' });
  const tChapters = await getTranslations({ locale, namespace: 'Chapters' });
  const tCta = await getTranslations({ locale, namespace: 'CtaBand' });

  // Best-effort course lookup for the breadcrumb. The course
  // page already lists the chapters + sessions, so the
  // back-link chain is chapter → course.
  const course = await getCourseById(session.chapter.course_id);

  // Pre-resolve the localized titles on the server. The
  // runtime app never reads the FR workbook's slug alias.
  const sessionTitle = localizedTitle(session, locale as 'en' | 'fr');
  const chapterTitle = localizedTitle(session.chapter, locale as 'en' | 'fr');
  const courseTitle = course
    ? localizedTitle(course, locale as 'en' | 'fr')
    : null;

  return (
    <>
      <PageHeader
        title={sessionTitle}
        description={
          session.description ?? t('liveOnlineSession')
        }
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          ...(course && courseTitle
            ? [
                {
                  label: courseTitle,
                  href: `/${locale}/courses/${course.slug}`,
                },
                {
                  label: chapterTitle,
                  href: `/${locale}/courses/${course.slug}/chapters/${session.chapter.slug}`,
                },
              ]
            : []),
          { label: t('title') },
        ]}
      />

      <Section spacing="default">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-8">
              <Card>
                <CardContent className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                        {sessionTitle}
                      </h2>
                      {session.description ? (
                        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                          {session.description}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {session.duration_min ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="h-4 w-4" aria-hidden="true" />
                            {t('duration', { minutes: session.duration_min })}
                          </span>
                        ) : null}
                        {session.is_preview ? (
                          <Badge variant="outline" className="text-[10px]">
                            {t('freePreview')}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-4 text-xs text-muted-foreground">
                        {tChapters('title')} · {chapterTitle}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {session.price_cents != null ? (
                        <p className="font-heading text-2xl font-bold text-foreground">
                          {formatCents(
                            session.price_cents as number,
                            session.currency,
                          )}
                        </p>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          {t('priceTbd')}
                        </Badge>
                      )}
                      <SessionBuyCta session={session} locale={locale} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <aside className="lg:col-span-4">
              <SessionCard
                session={session}
                displayTitle={sessionTitle}
                chapterHref={
                  course
                    ? `/${locale}/courses/${course.slug}/chapters/${session.chapter.slug}`
                    : `/${locale}/courses`
                }
                buyHref="#"
              />
            </aside>
          </div>
        </Container>
      </Section>

      <CtaBand
        title={tCta('questionTitle')}
        description={tCta('questionDescription')}
        primaryHref="/contact"
        primaryLabel={tCta('contactLabel')}
      />
    </>
  );
}
