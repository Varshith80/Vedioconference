import * as React from 'react';
import { DashboardClientLayout } from '@/components/dashboard/dashboard-client-layout';

// B1 placeholder: opt out of static generation because the
// dashboard reads the auth context which is request-scoped.
export const dynamic = 'force-dynamic';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardClientLayout>{children}</DashboardClientLayout>;
}
