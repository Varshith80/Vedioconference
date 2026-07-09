import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/lib/constants/brand';

export const metadata: Metadata = {
  title: `Vérifiez votre e-mail — ${BRAND.name}`,
  description: 'Confirmez votre adresse e-mail pour activer votre compte.',
  robots: { index: false, follow: false },
};

/**
 * Verify-email landing. The user lands here after sign-up. The
 * transactional e-mail (sent via Resend + n8n) carries a magic
 * link with a one-time code; B2 will land them on a callback
 * route that finishes the verification and redirects to the
 * dashboard.
 */
export default function VerifyEmailPage() {
  return (
    <Section spacing="default" aria-labelledby="verify-title">
      <Container>
        <div className="flex min-h-[60vh] items-center justify-center py-8">
          <div className="w-full max-w-md text-center">
            <div
              aria-hidden="true"
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--brand-accent)]/10 text-[color:var(--brand-accent)]"
            >
              <Mail className="h-6 w-6" />
            </div>
            <h1
              id="verify-title"
              className="mt-4 font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              Vérifiez votre boîte mail
            </h1>
            <p className="mt-3 text-pretty text-sm text-muted-foreground sm:text-base">
              Nous venons d’envoyer un e-mail de confirmation à l’adresse
              que vous avez indiquée. Ouvrez-le et cliquez sur le lien
              pour activer votre compte.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Vous n’avez rien reçu ? Vérifiez votre dossier de courrier
              indésirable, ou{' '}
              <Link href="/auth/register" className="underline">
                réessayez de créer un compte
              </Link>
              .
            </p>
            <div className="mt-6">
              <Button asChild variant="outline">
                <Link href="/">Retour à l’accueil</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
