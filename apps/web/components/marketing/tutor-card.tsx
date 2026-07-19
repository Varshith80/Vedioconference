import * as React from 'react';
import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PublicTutor } from '@/services/tutors';

// =====================================================================
// Sprint 3.8 — Public tutor card.
//
// Tutors are now standalone reference records (no headline, no bio,
// no rating, no years_experience, no avatar). The marketing card
// is reduced to name + email + phone + status, all of which are
// operational. There is no "verified" / "confirmé" / "years" badge
// because those persona fields do not exist anymore.
// =====================================================================

interface TutorCardProps {
  tutor: PublicTutor;
  className?: string;
}

export function TutorCard({ tutor, className }: TutorCardProps): React.JSX.Element {
  return (
    <Link
      href={`/tutors/${tutor.id}`}
      className={
        'group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
        'rounded-xl ' +
        (className ?? '')
      }
      aria-label={`Voir la fiche de ${tutor.full_name}`}
    >
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-2">
            <h3 className="truncate text-base font-semibold text-foreground sm:text-lg">
              {tutor.full_name}
            </h3>
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3 w-3" aria-hidden="true" />
                <span className="truncate">{tutor.email}</span>
              </span>
              {tutor.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3 w-3" aria-hidden="true" />
                  <span>{tutor.phone}</span>
                </span>
              ) : null}
            </div>
            <div className="mt-1">
              <Badge variant={tutor.status === 'active' ? 'secondary' : 'outline'}>
                {tutor.status}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
