import Link from 'next/link';
import { Container } from '@/components/shared/container';
import { Button } from '@/components/ui/button';

export default function GlobalNotFound() {
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">404</p>
      <h1 className="mt-3 font-heading text-3xl font-bold sm:text-4xl">Page introuvable</h1>
      <p className="mt-3 max-w-md text-base text-muted-foreground">
        La page que vous cherchez n’existe pas ou a été déplacée.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href="/">Retour à l’accueil</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/contact">Contacter le support</Link>
        </Button>
      </div>
    </Container>
  );
}
