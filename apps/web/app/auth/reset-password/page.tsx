import type { Metadata } from 'next';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { ResetPasswordForm } from '@/components/forms/reset-password-form';
import { BRAND } from '@/lib/constants/brand';

export const metadata: Metadata = {
  title: `Nouveau mot de passe — ${BRAND.name}`,
  description: 'Choisissez un nouveau mot de passe pour votre compte.',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <Section spacing="default" aria-labelledby="reset-title">
      <Container>
        <div className="flex min-h-[60vh] items-center justify-center py-8">
          <div>
            <h1 id="reset-title" className="sr-only">Nouveau mot de passe</h1>
            <ResetPasswordForm />
          </div>
        </div>
      </Container>
    </Section>
  );
}
