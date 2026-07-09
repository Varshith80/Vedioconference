import { redirect } from 'next/navigation';
import { requireProfile } from '@/hooks/use-require-user';

// Sprint B1 placeholder: opt out of static generation because
// `requireProfile` reads the Supabase session cookie. Chunk 9 of
// Sprint B1 will replace this with the (admin) layout and the
// useAuth() abstraction.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Administration' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  // The Database type is permissive (Record<string, unknown>) until
  // `pnpm db:types` runs; assert the public columns we need.
  const { role } = profile as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    redirect('/dashboard');
  }
  return <>{children}</>;
}
