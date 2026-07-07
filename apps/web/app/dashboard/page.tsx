import { requireProfile } from '@/hooks/use-require-user';

export const metadata = { title: 'Tableau de bord' };

export default async function DashboardPage() {
  const profile = await requireProfile();
  // The Database type is permissive (Record<string, unknown>) until
  // `pnpm db:types` runs; assert the public columns we need.
  const { full_name } = profile as { full_name: string | null };
  return (
    <main className="container py-12">
      <h1 className="text-3xl font-bold">Bienvenue {full_name ?? ''}</h1>
      <p className="mt-2 text-muted-foreground">Retrouvez vos cours, vos paiements et vos ressources.</p>
    </main>
  );
}
