import * as React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Button } from '@/components/ui/button';

interface CtaBandProps {
  title?: string;
  description?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

export function CtaBand({
  title = 'Prêt à démarrer ?',
  description = 'Créez votre compte en moins d’une minute et réservez votre premier cours.',
  primaryHref = '/auth/register',
  primaryLabel = 'Créer un compte',
  secondaryHref = '/courses',
  secondaryLabel = 'Parcourir les cours',
}: CtaBandProps) {
  return (
    <Section spacing="default" tone="brand" aria-labelledby="cta-title">
      <Container>
        <div className="grid items-center gap-6 md:grid-cols-12 md:gap-10">
          <div className="md:col-span-8">
            <Heading id="cta-title" level="h2" tone="invert" className="text-3xl sm:text-4xl">
              {title}
            </Heading>
            <p className="mt-3 max-w-2xl text-base text-primary-foreground/85 sm:text-lg">
              {description}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:col-span-4 md:justify-end">
            <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
              <Link href={secondaryHref}>
                {secondaryLabel}
              </Link>
            </Button>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={primaryHref}>
                {primaryLabel}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </Container>
    </Section>
  );
}
