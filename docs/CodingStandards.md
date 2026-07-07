# Coding standards

> A short, opinionated list. If a rule is not on this page, follow
> the prevailing pattern in the code you are touching.

## Language

- **TypeScript** with `strict: true`. No `any`, no `// @ts-ignore`.
- ESM imports everywhere (`import x from 'y'`). No CommonJS.
- `noUncheckedIndexedAccess: true` — every array index access is
  typed `T | undefined`.

## File layout

- One top-level export per file unless the file is explicitly a
  barrel (`index.ts`).
- Group imports: external → `@/` aliases → relative.
- Tailwind classes use `clsx` + `tailwind-merge` via `cn()`.

## Naming

| Item | Convention | Example |
|---|---|---|
| React component | PascalCase | `LoginForm.tsx` |
| Hook | camelCase, `use` prefix | `useUser.ts` |
| Service (server) | camelCase noun | `bookings.ts` |
| Utility | camelCase | `formatCents.ts` |
| Constant | SCREAMING_SNAKE | `MAX_PAGE_SIZE` |
| Type / interface | PascalCase | `BookingStatus` |
| Enum (TS)        | PascalCase, members PascalCase | `BookingStatus.Confirmed` |
| Postgres enum    | snake_case (`user_role`) | mapped to TS PascalCase |
| SQL table        | snake_case, plural | `course_tutors` |
| API route        | kebab-case folders, `route.ts` | `bookings/[id]/cancel` |

## Functions

- **Pure where possible.** No I/O in helpers.
- **One responsibility per function.** Max 30 lines, max 4 parameters
  (pass an object beyond that).
- **Always return a value**; no implicit `undefined` returns.

## Errors

- Throw `ApiError` (or a subclass) from server code.
- The centralised `errorResponse` is the **only** way to convert
  errors to HTTP responses — never call `NextResponse.json(..., { status: 500 })` inline.

## React

- **Server Components by default.** Mark a component `'use client'`
  only when it needs state, effects, or browser APIs.
- Props: a single `interface XxxProps` exported from the same file.
- Avoid inline `style={{...}}` — use Tailwind utilities.
- Forms: `react-hook-form` + `zodResolver`.

## Data access

- Server components and route handlers use the **server** Supabase
  client (`@/lib/supabase/server`).
- The **admin** client (`@/lib/supabase/admin`) is only used inside
  `app/api/webhooks/**` and `app/api/auth/register/**`.
- Mutations always go through API route handlers — never call
  mutating Supabase code from a client component.

## Testing

- **Unit:** Vitest, co-located as `*.test.ts` next to the file.
- **Integration:** Vitest, in `apps/web/tests/integration/`.
- **E2E:** Playwright, in `apps/web/tests/e2e/`.
- The CI workflow must be green before a PR can be merged.

## Commits

- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`,
  `refactor:`, `test:`, `build:`, `ci:`, `perf:`).
- Subject ≤ 72 chars, body wrapped at 100 cols, body explains
  *why*, not *what*.

## Branch strategy

```
main                  ← production
 ├── staging          ← release-candidate
 │    ├── feat/<name>
 │    ├── fix/<name>
 │    └── chore/<name>
 └── hotfix/<name>    ← direct to main when needed
```

- A PR into `main` requires:
  - 1 approval
  - green CI
  - up-to-date branch
  - Conventional Commits subject

## Code review checklist

- [ ] Does the change follow the layer rules in
      `docs/FolderStructure.md`?
- [ ] Is the type safe? (No `any`, no unhandled `undefined`.)
- [ ] Are inputs validated?
- [ ] Are errors handled by `errorResponse`?
- [ ] Is the new code covered by a test (or marked `TODO` with a
      linked issue)?
- [ ] Are the docs updated (README, API, schema, env)?
- [ ] Is the diff small and focused?

## Accessibility

- All interactive elements have an accessible name.
- Forms have `<label htmlFor>`.
- Color contrast meets WCAG 2.1 AA.
- Focus styles are visible (Tailwind `focus-visible`).
