import { requireProfile } from '@/hooks/use-require-user';
import { getStudentBookings } from '@/services/bookings';
import { formatDateTime, formatCents } from '@/lib/utils/format';

export const metadata = { title: 'Mes réservations' };

export default async function DashboardBookingsPage() {
  const profile = await requireProfile();
  const bookings = await getStudentBookings(profile.id);

  return (
    <main className="container py-12">
      <h1 className="text-3xl font-bold">Mes réservations</h1>
      <ul className="mt-8 divide-y rounded-lg border">
        {bookings.length === 0 && (
          <li className="p-6 text-sm text-muted-foreground">Aucune réservation pour le moment.</li>
        )}
        {bookings.map((b) => (
          <li key={b.id} className="flex items-center justify-between p-6">
            <div>
              <p className="font-medium">{(b as { course?: { title?: string } }).course?.title ?? 'Cours'}</p>
              <p className="text-sm text-muted-foreground">{formatDateTime(b.scheduled_start)}</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="rounded-full bg-secondary px-3 py-1 text-xs">{b.status}</span>
              <span className="text-sm font-medium">{formatCents(b.amount_cents, b.currency)}</span>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
