import { requireProfile } from '@/hooks/use-require-user';

export const metadata = { title: 'Tableau de bord' };

export default async function DashboardPage() {
  const profile = await requireProfile();
  return (
    <main className="container py-12">
      <h1 className="text-3xl font-bold">Bienvenue {profile.full_name ?? ''}</h1>
      <p className="mt-2 text-muted-foreground">Retrouvez vos cours, vos paiements et vos ressources.</p>
    </main>
  );
}
