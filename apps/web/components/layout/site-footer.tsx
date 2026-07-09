import * as React from 'react';
import Link from 'next/link';
import { BrandMark } from './brand-mark';
import { Container } from '@/components/shared/container';
import { Separator } from '@/components/ui/separator';
import { BRAND, FOOTER_LINKS } from '@/lib/constants/brand';

/**
 * Marketing site footer. The full rewrite (flat single-line per
 * the client brief) lands in Chunk 2 of Sprint B1. For now this
 * keeps the existing grid layout but pulls the data from the
 * new `FOOTER_LINKS` constant so the build stays green.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-12 border-t bg-muted/30 sm:mt-16">
      <Container className="py-10 sm:py-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4 md:gap-10">
          <div className="space-y-3 sm:col-span-2 md:col-span-1">
            <BrandMark size="sm" />
            <p className="max-w-xs text-sm text-muted-foreground">
              {BRAND.shortDescription}
            </p>
          </div>

          <nav aria-label="Pied de page" className="text-sm md:col-span-3">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {FOOTER_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col items-start justify-between gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>
            © {year} {BRAND.legalName}. Tous droits réservés.
          </p>
          <p>
            <a
              href={`mailto:${BRAND.contactEmail}`}
              className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {BRAND.contactEmail}
            </a>
          </p>
        </div>
      </Container>
    </footer>
  );
}
