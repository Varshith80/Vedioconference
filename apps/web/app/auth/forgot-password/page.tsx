export const metadata = { title: 'Mot de passe oublié' };

import { ForgotPasswordForm } from '@/components/forms/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <main className="container flex min-h-screen items-center justify-center py-12">
      <ForgotPasswordForm />
    </main>
  );
}
