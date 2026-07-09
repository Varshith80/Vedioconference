'use client';

import * as React from 'react';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/services/auth/use-auth';

export default function DashboardProfilePage() {
  const auth = useAuth();
  const user = auth.session?.user;

  return (
    <Section spacing="default" aria-labelledby="profile-title">
      <Container>
        <Breadcrumbs
          items={[
            { label: 'Accueil', href: '/' },
            { label: 'Tableau de bord', href: '/dashboard' },
            { label: 'Profil' },
          ]}
        />
        <div className="mt-3">
          <Heading id="profile-title" level="h1" className="text-3xl sm:text-4xl">
            Mon profil
          </Heading>
          <p className="mt-2 text-base text-muted-foreground">
            Vos informations de compte. La modification sera activée en Sprint B2.
          </p>
        </div>

        <dl className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-card p-6">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Nom
            </dt>
            <dd className="mt-1 text-base text-foreground">{user?.fullName ?? '—'}</dd>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              E-mail
            </dt>
            <dd className="mt-1 text-base text-foreground">{user?.email ?? '—'}</dd>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Compte créé le
            </dt>
            <dd className="mt-1 text-base text-foreground">
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('fr-FR') : '—'}
            </dd>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              ID
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {user?.id ?? '—'}
            </dd>
          </div>
        </dl>

        <div className="mt-8">
          <Button type="button" variant="outline" disabled>
            Modifier mon profil (Sprint B2)
          </Button>
        </div>
      </Container>
    </Section>
  );
}
