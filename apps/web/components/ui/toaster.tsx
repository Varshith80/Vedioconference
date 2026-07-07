'use client';

import { Toaster as SonnerToaster } from '@/components/ui/toaster';
import { useEffect, useState } from 'react';

/**
 * Toast container that hydrates only on the client. It mounts
 * Sonner under a portal at <body>.
 */
export function Toaster() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <SonnerToaster />;
}
