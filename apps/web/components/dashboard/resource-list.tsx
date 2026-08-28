import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Resource } from '@/services/resources';

// =====================================================================
// Sprint 8 — Student-facing resource list. One card per
// resource. The "Download" button opens the storage URL in a
// new tab (we keep file handling out of the server — the file
// sits on Supabase Storage and the URL is `file_path`).
//
// Visibility is shown verbatim as a badge so the student can
// see *why* a resource appears for them:
//   - `public`   → "Public"
//   - `enrolled` → "Enrolled"
//   - `private`  → "Private (you)"
//
// The card itself is purely presentational; visibility was
// already enforced server-side by the `resources_select_visible`
// RLS policy before this list ever rendered.
// =====================================================================

export interface ResourceListProps {
  resources: ReadonlyArray<Resource>;
}

function visibilityBadgeVariant(visibility: Resource['visibility']) {
  switch (visibility) {
    case 'public':
      return 'default' as const;
    case 'enrolled':
      return 'secondary' as const;
    case 'private':
      return 'outline' as const;
  }
}

export function ResourceList({ resources }: ResourceListProps): React.JSX.Element {
  const t = useTranslations('Dashboard.resources');

  return (
    <ul role="list" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {resources.map((r) => (
        <li key={r.id} className="h-full">
          <Card className="flex h-full flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="line-clamp-2 text-base">
                    {r.title}
                  </CardTitle>
                  {r.description ? (
                    <CardDescription className="mt-1 line-clamp-2 text-xs">
                      {r.description}
                    </CardDescription>
                  ) : null}
                </div>
                <Badge
                  variant={visibilityBadgeVariant(r.visibility)}
                  className="shrink-0 text-[10px]"
                >
                  {t(`visibility.${r.visibility}` as 'visibility.public')}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="mt-auto flex items-center justify-between gap-3 text-sm">
              <span className="line-clamp-1 font-mono text-xs text-muted-foreground">
                {r.fileName}
              </span>
              <a
                href={r.filePath}
                target="_blank"
                rel="noopener noreferrer"
                download={r.fileName}
                className="inline-flex"
              >
                <Button type="button" variant="outline" size="sm">
                  <Download className="h-4 w-4" aria-hidden={true} />
                  {t('download')}
                </Button>
              </a>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

ResourceList.displayName = 'ResourceList';