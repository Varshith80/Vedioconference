import { requireProfile } from '@/hooks/use-require-user';
import { getStudentBookings } from '@/services/bookings';
import { formatDateTime, formatCents } from '@/lib/utils/format';

export const metadata = { title: 'Mes réservations' };

export default async function DashboardBookingsPage() {
  const profile = await requireProfile();
  // The Database type is permissive (Record<string, unknown>) until
  // `pnpm db:types` runs; assert the public columns we need.
  const { id } = profile as { id: string };
  const bookings = await getStudentBookings(id);

  return (
    <main className="container py-12">
      <h1 className="text-3xl font-bold">Mes réservations</h1>
      <ul className="mt-8 divide-y rounded-lg border">
        {bookings.length === 0 && (
          <li className="p-6 text-sm text-muted-foreground">Aucune réservation pour le moment.</li>
        )}
        {bookings.map((b) => {
          const booking = b as {
            id: string;
            scheduled_start: string;
            status: string;
            course?: { title?: string } | null;
            amount_cents?: number | null;
            currency?: string | null;
          };
          return (
            <li key={booking.id} className="flex items-center justify-between p-6">
              <div>
                <p className="font-medium">{booking.course?.title ?? 'Cours'}</p>
                <p className="text-sm text-muted-foreground">{formatDateTime(booking.scheduled_start)}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="rounded-full bg-secondary px-3 py-1 text-xs">{booking.status}</span>
                <span className="text-sm font-medium">
                  {formatCents(booking.amount_cents ?? 0, booking.currency ?? 'EUR')}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
