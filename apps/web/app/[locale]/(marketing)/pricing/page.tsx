import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { PageHeader } from '@/components/shared/page-header';
import { PricingTable } from '@/components/marketing/pricing-table';
import { asArray, type TLike } from '@/lib/i18n/paths';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Pricing' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: `/${locale}/pricing` },
  };
}

function getFaq(t: TLike) {
  return asArray<{ q: string; a: string }>(t('faqItems'));
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Pricing');
  const tNav = await getTranslations('Nav');
  const faq = getFaq(t);
  return (
    <>
      <PageHeader
        title={t('h1')}
        description={t('intro')}
        breadcrumbs={[
          { label: tNav('breadcrumb.home'), href: '/' },
          { label: tNav('breadcrumb.pricing') },
        ]}
      />

      <Section spacing="default" aria-labelledby="pricing-tiers">
        <Container>
          <Heading id="pricing-tiers" level="h2" className="sr-only">
            {t('tiersTitle')}
          </Heading>
          <PricingTable />
        </Container>
      </Section>

      <Section spacing="default" tone="muted" aria-labelledby="pricing-faq-title">
        <Container size="prose">
          <Heading id="pricing-faq-title" level="h2" className="text-center">
            {t('faqTitle')}
          </Heading>
          <dl className="mt-8 space-y-6">
            {faq.map((item) => (
              <div key={item.q}>
                <dt className="font-semibold text-foreground">{item.q}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </Section>
    </>
  );
}
