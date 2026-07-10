import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { BRAND } from '@/lib/constants/brand';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CheckoutClient } from '@/components/checkout/checkout-client';
import type { Locale } from '@/i18n';

type EnrollmentStatus = 'pending_payment' | 'active' | 'completed' | 'cancelled' | 'refunded';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: `Checkout — ${BRAND.name}`,
    description: 'Complete your enrollment.',
    alternates: { canonical: `/${locale}/checkout` },
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

export default async function CheckoutEnrollmentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id: enrollmentId } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/auth/login?next=/${locale}/checkout/enrollment/${enrollmentId}`);
  }

  // Read the enrollment + course for the card.
  const { data: enrollment, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('id, student_id, course_id, status, amount_cents, currency')
    .eq('id', enrollmentId)
    .maybeSingle();
  const enrollmentRow = enrollment as unknown as { id: string; student_id: string; course_id: string; status: string; amount_cents: number; currency: string } | null;
  if (enrollmentError || !enrollmentRow) notFound();
  if (enrollmentRow.student_id !== user.id) notFound();

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, slug, title, subtitle, subject, level, level_group, price_cents, currency')
    .eq('id', enrollmentRow.course_id)
    .single();
  const courseRow = course as unknown as { id: string; slug: string; title: string; subtitle: string | null; subject: string; level: string; level_group: string; price_cents: number; currency: string } | null;
  if (courseError || !courseRow) notFound();

  const t = await getTranslations('Checkout.enrollment');

  return (
    <Section spacing="default" aria-labelledby="checkout-title">
      <Container className="max-w-3xl">
        <div className="mt-10">
          <Heading id="checkout-title" level="h1" className="text-3xl sm:text-4xl">
            {t('title')}
          </Heading>
          <p className="mt-2 text-base text-muted-foreground sm:text-lg">
            {t('description')}
          </p>
        </div>

        <div className="mt-8 rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="font-heading text-xl font-semibold">{courseRow.title}</h2>
          {courseRow.subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{courseRow.subtitle}</p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {courseRow.subject} · {courseRow.level}
          </p>
          <p className="mt-4 text-2xl font-semibold">
            {(courseRow.price_cents / 100).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US', {
              style: 'currency',
              currency: courseRow.currency,
            })}
          </p>
        </div>

        <CheckoutClient
          enrollmentId={enrollmentRow.id}
          enrollmentStatus={enrollmentRow.status as EnrollmentStatus}
          locale={locale as Locale}
        />

        <p className="mt-6 text-xs text-muted-foreground">
          {t('secureNote')}
        </p>
        <p className="mt-2">
          <Link href={`/${locale}/courses/${courseRow.slug}`} className="text-xs text-[color:var(--brand-accent)] underline-offset-2 hover:underline">
            {t('backToCourse')}
          </Link>
        </p>
      </Container>
    </Section>
  );
}
