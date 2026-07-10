import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Button } from '@/components/ui/button';
import { CtaBand } from '@/components/marketing/cta-band';
import { SectionEyebrow } from '@/components/marketing/section-eyebrow';
import { asArray, type TLike } from '@/lib/i18n/paths';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'About' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: `/${locale}/about` },
  };
}

function getValues(t: TLike) {
  return asArray<{ title: string; body: string }>(t.raw('values'));
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('About');
  const values = getValues(t);
  return (
    <>
      <Section spacing="default" aria-labelledby="about-title">
        <Container size="prose">
          <SectionEyebrow label={t('eyebrow')} />
          <Heading id="about-title" level="h1" className="mt-4">
            {t('h1')}
          </Heading>
          <p className="mt-5 text-base text-muted-foreground sm:text-lg">
            {t('body1')}
          </p>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            {t('body2')}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/levels">
                {t('ctaPrimary')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/contact">{t('ctaSecondary')}</Link>
            </Button>
          </div>
        </Container>
      </Section>

      <Section spacing="default" tone="muted" aria-labelledby="values-title">
        <Container>
          <div className="mx-auto max-w-2xl">
            <SectionEyebrow number="01" label={t('valuesEyebrow')} />
            <Heading id="values-title" level="h2" className="mt-3 text-3xl sm:text-4xl">
              {t('valuesTitle')}
            </Heading>
          </div>

          <ul
            role="list"
            className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6"
          >
            {values.map((v) => (
              <li
                key={v.title}
                className="flex flex-col gap-3 rounded-lg border bg-card p-6 shadow-sm"
              >
                <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  {v.title}
                </h3>
                <p className="text-pretty text-sm text-muted-foreground sm:text-base">
                  {v.body}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <CtaBand
        title={t('bandTitle')}
        description={t('bandDescription')}
        primaryHref="/contact"
        primaryLabel={t('bandPrimary')}
        secondaryHref="/pricing"
        secondaryLabel={t('bandSecondary')}
      />
    </>
  );
}
