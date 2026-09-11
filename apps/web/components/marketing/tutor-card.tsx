import * as React from 'react';
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PublicTutor } from '@/services/tutors';

// =====================================================================
// Public tutor card — reads from the curated `public.public_tutors`
// view, which carries only id, full_name, subject, bio, and
// years_experience. PII (email, phone, notes) is never rendered.
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
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/70">
              <GraduationCap className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="truncate text-base font-semibold text-foreground sm:text-lg">
                {tutor.full_name}
              </h3>
              <p className="truncate text-sm font-medium text-[color:var(--brand-accent)]">
                {tutor.subject}
              </p>
              {tutor.bio ? (
                <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {tutor.bio}
                </p>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                {tutor.years_experience > 0 ? (
                  <Badge variant="outline" className="text-xs">
                    {tutor.years_experience} an{tutor.years_experience > 1 ? 's' : ''} d&rsquo;expérience
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
