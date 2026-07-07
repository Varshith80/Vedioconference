export const metadata = { title: 'Cours' };

import { getPublishedCourses } from '@/services/courses';
import { formatCents } from '@/lib/utils/format';

export default async function CoursesPage() {
  const courses = await getPublishedCourses();

  return (
    <main className="container py-16">
      <h1 className="text-3xl font-bold">Catalogue de cours</h1>
      <p className="mt-2 text-muted-foreground">Choisissez un cours et réservez votre créneau.</p>

      <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((c) => (
          <li key={c.id} className="rounded-lg border p-6">
            <h2 className="text-lg font-semibold">{c.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{c.level} · {c.subject}</p>
            {c.subtitle && <p className="mt-4 text-sm">{c.subtitle}</p>}
            <p className="mt-6 text-lg font-semibold">{formatCents(c.price_cents, c.currency)}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
