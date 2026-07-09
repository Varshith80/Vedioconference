import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, CalendarRange, FileText } from 'lucide-react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { BRAND } from '@/lib/constants/brand';

export const metadata: Metadata = {
  title: `Tableau de bord — ${BRAND.name}`,
  description: 'Retrouvez vos cours, vos paiements et vos ressources.',
};

// Sprint B1: the dashboard is a placeholder shell. The B2 sprint
// will replace these cards with real data from Supabase.
export const dynamic = 'force-dynamic';

const QUICK_LINKS = [
  {
    href: '/dashboard/bookings',
    title: 'Mes réservations',
    description: 'Consultez vos séances à venir et votre historique.',
    icon: CalendarRange,
  },
  {
    href: '/dashboard/resources',
    title: 'Ressources',
    description: 'Supports de cours, exercices corrigés, notes partagées.',
    icon: BookOpen,
  },
  {
    href: '/dashboard/profile',
    title: 'Mon profil',
    description: 'Informations personnelles, niveau, préférences.',
    icon: FileText,
  },
] as const;

export default function DashboardPage() {
  return (
    <Section spacing="default" aria-labelledby="dashboard-title">
      <Container>
        <Breadcrumbs items={[{ label: 'Accueil', href: '/' }, { label: 'Tableau de bord' }]} />
        <div className="mt-3">
          <Heading id="dashboard-title" level="h1" className="text-3xl sm:text-4xl">
            Bienvenue.
          </Heading>
          <p className="mt-2 text-base text-muted-foreground sm:text-lg">
            Retrouvez vos cours, vos paiements et vos ressources.
          </p>
        </div>

        <ul role="list" className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((q) => {
            const Icon = q.icon;
            return (
              <li key={q.href}>
                <Link
                  href={q.href}
                  className="group flex h-full flex-col gap-3 rounded-lg border bg-card p-6 shadow-sm transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="h-6 w-6 text-[color:var(--brand-accent)]" aria-hidden={true} />
                  <h2 className="font-heading text-lg font-semibold text-foreground">
                    {q.title}
                  </h2>
                  <p className="text-pretty text-sm text-muted-foreground">{q.description}</p>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-[color:var(--brand-accent)]">
                    Ouvrir
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden={true} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </Section>
  );
}
