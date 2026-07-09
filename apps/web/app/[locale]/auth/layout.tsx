import * as React from 'react';
import { AuthClientLayout } from '@/components/auth/auth-client-layout';

// B1 placeholder: opt out of static generation because the auth
// tree reads the auth context which is request-scoped.
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthClientLayout>{children}</AuthClientLayout>;
}
