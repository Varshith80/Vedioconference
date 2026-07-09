import Link from 'next/link';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Button } from '@/components/ui/button';
import { defaultLocale, isLocale } from '@/i18n';

export default async function GlobalNotFound() {
  const h = await headers();
  const candidate = h.get('x-next-intl-locale');
  const locale = isLocale(candidate) ? candidate : defaultLocale;
  const t = await getTranslations({ locale, namespace: 'NotFound' });
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">
        {t('eyebrow')}
      </p>
      <h1 className="mt-3 font-heading text-3xl font-bold sm:text-4xl">{t('h1')}</h1>
      <p className="mt-3 max-w-md text-base text-muted-foreground">
        {t('body')}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href={`/${locale}`}>{t('home')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/${locale}/contact`}>{t('contact')}</Link>
        </Button>
      </div>
    </Container>
  );
}
