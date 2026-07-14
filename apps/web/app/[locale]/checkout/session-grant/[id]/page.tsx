import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Card, CardContent } from '@/components/ui/card';
import { SessionGrantCheckoutCard } from '@/components/checkout/session-grant-checkout-card';
import { BRAND } from '@/lib/constants/brand';
import { getCurrentUser } from '@/services/auth';
import { getSessionGrant } from '@/services/curriculum/session-grants';
import { getSessionWithChapter } from '@/services/curriculum/sessions';
import { formatCents } from '@/lib/utils/format';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<Metadata> {
  const { id, locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Checkout.sessionGrant' });
  return {
    title: `${t('title')} — ${BRAND.name}`,
    alternates: { canonical: `/${locale}/checkout/session-grant/${id}` },
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

export default async function CheckoutSessionGrantPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Checkout.sessionGrant');

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/${locale}/auth/login?next=/${locale}/checkout/session-grant/${id}`);
  }

  const grant = await getSessionGrant(id);
  if (!grant) notFound();
  if (grant.student_id !== user.id) notFound();

  const session = await getSessionWithChapter(grant.session_id);
  if (!session) notFound();

  // If the grant is already paid, redirect to the dashboard.
  if (grant.status === 'active' || grant.status === 'completed') {
    redirect(`/${locale}/dashboard/sessions/${session.id}`);
  }
  if (grant.status === 'cancelled' || grant.status === 'refunded') {
    return (
      <Section spacing="default" aria-labelledby="checkout-title">
        <Container>
          <Heading id="checkout-title" level="h1" className="text-3xl sm:text-4xl">
            {t('title')}
          </Heading>
          <Card className="mt-6">
            <CardContent className="p-6 text-sm text-muted-foreground">
              {t('alreadyPaidDescription')}
            </CardContent>
          </Card>
          <p className="mt-4">
            <Link
              href={`/${locale}/dashboard/sessions`}
              className="text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('goToDashboard')} →
            </Link>
          </p>
        </Container>
      </Section>
    );
  }

  return (
    <Section spacing="default" aria-labelledby="checkout-title">
      <Container>
        <Heading id="checkout-title" level="h1" className="text-3xl sm:text-4xl">
          {t('title')}
        </Heading>
        <p className="mt-2 max-w-prose text-base text-muted-foreground">
          {t('description', {
            session: session.title,
            amount: formatCents(grant.amount_cents, grant.currency),
          })}
        </p>

        <div className="mt-8 max-w-xl">
          <SessionGrantCheckoutCard
            sessionGrantId={grant.id}
            status={grant.status as 'pending_payment' | 'active' | 'completed' | 'cancelled' | 'refunded'}
            sessionTitle={session.title}
            amountCents={grant.amount_cents}
            currency={grant.currency}
            locale={locale as 'en' | 'fr'}
          />
        </div>
      </Container>
    </Section>
  );
}
