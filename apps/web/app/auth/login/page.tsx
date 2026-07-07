export const metadata = { title: 'Connexion' };

import { LoginForm } from '@/components/forms/login-form';

export default function LoginPage() {
  return (
    <main className="container flex min-h-screen items-center justify-center py-12">
      <LoginForm />
    </main>
  );
}
