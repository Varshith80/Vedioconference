import { Skeleton } from '@/components/ui/skeleton';
import { Container } from '@/components/shared/container';

export default function GlobalLoading() {
  return (
    <Container className="py-16 sm:py-20">
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3 sm:h-14" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-5/6 max-w-xl" />
      </div>
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    </Container>
  );
}
