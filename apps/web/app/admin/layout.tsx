import { redirect } from 'next/navigation';
import { requireProfile } from '@/hooks/use-require-user';

export const metadata = { title: 'Administration' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  if (profile.role !== 'admin' && profile.role !== 'super_admin') {
    redirect('/dashboard');
  }
  return <>{children}</>;
}
