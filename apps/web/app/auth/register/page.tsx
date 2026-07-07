export const metadata = { title: 'Créer un compte' };

import { RegisterForm } from '@/components/forms/register-form';

export default function RegisterPage() {
  return (
    <main className="container flex min-h-screen items-center justify-center py-12">
      <RegisterForm />
    </main>
  );
}
