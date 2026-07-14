import * as React from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { PublicTutor } from '@/services/tutors';

interface TutorCardProps {
  tutor: PublicTutor;
  className?: string;
}

/**
 * Public tutor card. Pure presentational, no DB / no business logic.
 * Wrapped in a Link so the whole tile is clickable on touch.
 */
export function TutorCard({ tutor, className }: TutorCardProps) {
  return (
    <Link
      href={`/tutors/${tutor.id}`}
      className={
        'group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
        'rounded-xl ' +
        (className ?? '')
      }
      aria-label={`Voir le profil de ${tutor.full_name}`}
    >
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-12 w-12">
              {tutor.avatar_url ? <AvatarImage src={tutor.avatar_url} alt="" /> : null}
              <AvatarFallback>
                {tutor.full_name
                  .split(' ')
                  .map((w) => w[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold text-foreground sm:text-lg">
                {tutor.full_name}
              </h3>
              {tutor.headline && (
                <p className="line-clamp-1 text-sm text-muted-foreground">{tutor.headline}</p>
              )}
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-foreground">
                <Star className="h-3 w-3 fill-warning text-warning" aria-hidden="true" />
                {tutor.rating.toFixed(1)} / 5
                {tutor.years_experience > 0 && (
                  <span className="ml-2 text-muted-foreground">
                    · {tutor.years_experience} an{tutor.years_experience > 1 ? 's' : ''} d’expérience
                  </span>
                )}
              </p>
            </div>
          </div>

          {tutor.bio && (
            <p className="mt-4 line-clamp-3 text-sm text-muted-foreground">{tutor.bio}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-1.5">
            <Badge variant="secondary">Vérifié</Badge>
            {tutor.years_experience >= 3 && <Badge variant="outline">Confirmé</Badge>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
