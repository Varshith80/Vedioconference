import * as React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PRICING_TIERS } from '@/lib/constants/pricing';
import { formatCents } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

export function PricingTable() {
  return (
    <ul
      role="list"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
    >
      {PRICING_TIERS.map((tier) => (
        <li key={tier.id} className="h-full">
          <Card
            className={cn(
              'flex h-full flex-col',
              tier.highlight && 'border-primary shadow-md ring-1 ring-primary/30',
            )}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">{tier.name}</CardTitle>
                {tier.highlight && <Badge>Le plus populaire</Badge>}
              </div>
              <CardDescription>{tier.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="flex items-baseline gap-1">
                <span className="font-heading text-4xl font-bold tracking-tight">
                  {formatCents(tier.priceCents, tier.currency)}
                </span>
                <span className="text-sm text-muted-foreground">/ {tier.billing}</span>
              </div>
              <ul role="list" className="mt-6 space-y-3 text-sm">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="text-foreground/90">{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                variant={tier.highlight ? 'default' : 'outline'}
                asChild
              >
                <Link href={tier.cta.href}>{tier.cta.label}</Link>
              </Button>
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  );
}
