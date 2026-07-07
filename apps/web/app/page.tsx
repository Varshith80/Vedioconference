import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="container py-24">
      <section className="mx-auto max-w-3xl text-center">
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
          Cours particuliers en visioconférence
        </h1>
        <p className="mt-6 text-lg text-muted-foreground">
          Lycée · Classes préparatoires · Réservez, payez, rejoignez la classe.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/courses">Découvrir les cours</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/auth/register">Créer un compte</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
