import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { PageHeader } from '@/components/shared/page-header';
import { ContactForm } from '@/components/marketing/contact-form';
import { BRAND } from '@/lib/constants/brand';
import { Mail, MapPin, Phone } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Contact' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: `/${locale}/contact` },
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Contact');
  const tNav = await getTranslations('Nav');
  return (
    <>
      <PageHeader
        title={t('h1')}
        description={t('intro')}
        breadcrumbs={[
          { label: tNav('breadcrumbs.home'), href: '/' },
          { label: tNav('breadcrumbs.contact') },
        ]}
      />

      <Section spacing="default" aria-labelledby="contact-form-title">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <Heading id="contact-form-title" level="h2" className="text-2xl sm:text-3xl">
                {t('formTitle')}
              </Heading>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                {t('formHint')}
              </p>
              <div className="mt-6">
                <ContactForm />
              </div>
            </div>

            <aside className="lg:col-span-5" aria-label={t('coordsTitle')}>
              <div className="rounded-xl border bg-muted/30 p-6 sm:p-8">
                <h2 className="text-base font-semibold text-foreground">
                  {t('coordsTitle')}
                </h2>
                <ul role="list" className="mt-4 space-y-4 text-sm">
                  <li className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
                    <div>
                      <p className="font-medium text-foreground">{t('emailLabel')}</p>
                      <a
                        href={`mailto:${BRAND.contactEmail}`}
                        className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {BRAND.contactEmail}
                      </a>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
                    <div>
                      <p className="font-medium text-foreground">{t('addressLabel')}</p>
                      <p className="text-muted-foreground">
                        {BRAND.addressLocality}, {BRAND.addressCountry}
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Phone className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
                    <div>
                      <p className="font-medium text-foreground">{t('supportLabel')}</p>
                      <p className="text-muted-foreground">{t('supportHours')}</p>
                    </div>
                  </li>
                </ul>

                <div className="mt-6 rounded-md border bg-background p-4 text-xs text-muted-foreground">
                  <p>
                    {t.rich('techIssueRich', {
                      link: (chunks) => (
                        <Link href="/contact" className="underline">
                          {chunks}
                        </Link>
                      ),
                    })}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </Container>
      </Section>
    </>
  );
}
