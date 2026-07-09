import * as React from 'react';
import Link from 'next/link';
import { Container } from '@/components/shared/container';
import { BRAND } from '@/lib/constants/brand';
import type { FooterLink } from '@/lib/i18n/nav';

type SiteFooterProps = {
  /** Localised footer links — sourced from the active locale's
   *  `Nav.footer` array. */
  links: ReadonlyArray<FooterLink>;
};

/**
 * Marketing site footer. Per the client brief the footer is a single
 * flat line, not the multi-column grid you typically see on a SaaS
 * marketing site. The links are passed in as a prop so the same
 * component can be rendered in any locale-aware context; the
 * copyright year and brand name are structural and come from
 * `lib/constants/brand.ts`.
 */
export function SiteFooter({ links }: SiteFooterProps) {
  return (
    <footer className="mt-12 border-t bg-muted/30 sm:mt-16">
      <Container className="py-6 sm:py-8">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {links.map((link, i) => (
            <React.Fragment key={link.href}>
              {i > 0 && (
                <span aria-hidden="true" className="text-muted-foreground/50">
                  ·
                </span>
              )}
              <Link
                href={link.href}
                className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
              </Link>
            </React.Fragment>
          ))}
          <span aria-hidden="true" className="text-muted-foreground/50">·</span>
          <span>© {BRAND.copyrightYear} {BRAND.name}</span>
        </p>
      </Container>
    </footer>
  );
}
