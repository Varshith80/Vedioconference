import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // The Sprint 3.7 `levels-page.test.tsx` imports an RSC page
  // (a `.tsx` file that contains JSX without an explicit
  // `import * as React from 'react'`). Next.js compiles such
  // files with the React 19 automatic runtime (`jsx:
  // 'preserve'` + Babel/SWC). Vitest's esbuild transformer
  // defaults to the *classic* runtime, which emits
  // `React.createElement(...)` and fails with "React is not
  // defined". Force the automatic runtime at the top-level
  // (NOT inside `test:` — that sub-key is for esbuild options
  // *per file*, but the JSX transform is a project-wide
  // default) so the same JSX compiles cleanly under Vitest.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    include: [
      'tests/**/*.test.{ts,tsx}',
      'lib/**/*.test.{ts,tsx}',
      'components/**/*.test.{ts,tsx}',
      'app/**/*.test.{ts,tsx}',
      'services/**/*.test.{ts,tsx}',
      'types/**/*.test.{ts,tsx}',
    ],
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts', 'services/**/*.ts'],
      exclude: ['lib/supabase/admin.ts', 'lib/email/client.ts', '**/types.ts'],
    },
  },
  resolve: {
    alias: {
      '@': here,
      // `server-only` is a runtime guard for RSC/Server modules
      // (Next.js ships a real implementation that throws on
      // accidental client import). In Vitest we just stub it
      // to a no-op module so unit tests can import server-side
      // code directly.
      'server-only': path.resolve(here, 'tests/_shims/server-only.ts'),
    },
  },
});
