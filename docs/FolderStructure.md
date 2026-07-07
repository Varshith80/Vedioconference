# Folder structure

> Annotated tree of the entire repository. Every directory has a
> single, documented responsibility.

```
vedioconference/
├── apps/
│   └── web/                            # Next.js 15 application
│       │
│       ├── app/                        # ── App Router (RSC + Route Handlers)
│       │   ├── layout.tsx              #   Root layout (html, body, providers)
│       │   ├── page.tsx                #   Marketing landing page
│       │   │
│       │   ├── (marketing)/            #   Public marketing pages
│       │   │   ├── courses/            #     Course catalog & detail
│       │   │   ├── tutors/             #     Tutor directory
│       │   │   ├── pricing/            #     Pricing page
│       │   │   ├── about/              #     About
│       │   │   └── contact/            #     Contact form
│       │   │
│       │   ├── auth/                   #   Auth pages
│       │   │   ├── login/
│       │   │   ├── register/
│       │   │   ├── forgot-password/
│       │   │   └── reset-password/
│       │   │
│       │   ├── dashboard/              #   Authenticated student area
│       │   │   ├── page.tsx            #     Overview
│       │   │   ├── bookings/           #     Upcoming + past
│       │   │   ├── resources/          #     Course materials
│       │   │   ├── payments/           #     Invoice list
│       │   │   └── profile/            #     Edit profile
│       │   │
│       │   ├── admin/                  #   Admin / super-admin area
│       │   │   ├── layout.tsx          #     Role check
│       │   │   ├── page.tsx            #     KPIs
│       │   │   ├── courses/            #     CRUD courses
│       │   │   ├── tutors/             #     CRUD tutors
│       │   │   ├── bookings/           #     All bookings
│       │   │   ├── resources/          #     Resource library
│       │   │   └── users/              #     Students list
│       │   │
│       │   └── api/                    #   HTTP route handlers
│       │       ├── auth/
│       │       │   ├── route.ts
│       │       │   ├── register/route.ts
│       │       │   └── callback/route.ts
│       │       ├── profile/route.ts
│       │       ├── courses/
│       │       │   ├── route.ts
│       │       │   └── [slug]/route.ts
│       │       ├── tutors/route.ts
│       │       ├── bookings/
│       │       │   ├── route.ts
│       │       │   ├── checkout/route.ts
│       │       │   └── [id]/cancel/route.ts
│       │       ├── resources/route.ts
│       │       ├── admin/overview/route.ts
│       │       └── webhooks/
│       │           ├── n8n/route.ts
│       │           └── stripe/route.ts
│       │
│       ├── components/                 # ── React components
│       │   ├── ui/                     #   shadcn/ui primitives
│       │   ├── layout/                 #   Header, footer, sidebars
│       │   ├── marketing/              #   Hero, feature cards, CTAs
│       │   ├── dashboard/              #   Student dashboard widgets
│       │   ├── admin/                  #   Admin tables, forms
│       │   ├── forms/                  #   Login, register, checkout
│       │   └── shared/                 #   Cross-cutting (Logo, etc.)
│       │
│       ├── lib/                        # ── Framework adapters & utilities
│       │   ├── supabase/               #   client.ts | server.ts | admin.ts
│       │   ├── stripe/                 #   Stripe SDK wrapper
│       │   ├── email/                  #   Resend SDK wrapper
│       │   ├── utils/                  #   cn, format, errors, logger, api
│       │   ├── constants/              #   App-wide constants
│       │   └── validations/            #   Zod schemas
│       │
│       ├── services/                   # ── Server-side data access
│       │   ├── auth.ts
│       │   ├── bookings.ts
│       │   ├── courses.ts
│       │   ├── resources.ts
│       │   └── ...
│       │
│       ├── hooks/                      # ── React hooks
│       │   ├── use-user.ts
│       │   └── use-require-user.ts
│       │
│       ├── types/                      # ── TypeScript types
│       │   ├── database.generated.ts   #   `supabase gen types`
│       │   └── domain.ts
│       │
│       ├── styles/
│       │   └── globals.css
│       │
│       ├── public/                     # Static assets
│       ├── tests/                      # Vitest + Playwright
│       │
│       ├── middleware.ts               # Auth + headers middleware
│       ├── next.config.mjs
│       ├── tailwind.config.ts
│       ├── postcss.config.mjs
│       ├── tsconfig.json
│       ├── package.json
│       ├── .env.example
│       └── .eslintrc.json
│
├── supabase/
│   ├── config.toml
│   ├── migrations/                     # Numbered, idempotent SQL
│   │   ├── 20260707000001_extensions_and_helpers.sql
│   │   ├── 20260707000002_profiles_and_roles.sql
│   │   ├── 20260707000003_tutors_courses.sql
│   │   ├── 20260707000004_bookings_payments.sql
│   │   ├── 20260707000005_resources_notifications_audit.sql
│   │   ├── 20260707000006_rls_policies.sql
│   │   └── 20260707000007_storage_buckets.sql
│   ├── seed/000_seed.sql
│   ├── functions/                     # Edge functions (Phase 3+)
│   └── policies/                      # RLS policy review notes
│
├── n8n/
│   ├── workflows/                     # Exported JSON for every workflow
│   ├── credentials/                   # Credential templates (no secrets)
│   └── docs/
│       └── WORKFLOWS.md
│
├── docs/
│   ├── FolderStructure.md             # ← this file
│   ├── Architecture.md
│   ├── DevelopmentRoadmap.md
│   ├── architecture/
│   │   ├── Architecture.md
│   │   ├── SYSTEM_ARCHITECTURE.mmd
│   │   ├── ER_DIAGRAM.mmd
│   │   ├── USER_FLOW.mmd
│   │   └── AUTH_FLOW.mmd
│   ├── database/
│   │   └── Database.md
│   ├── api/
│   │   └── API.md
│   ├── deployment/
│   │   ├── Deployment.md
│   │   └── Environment.md
│   └── security/
│       └── Security.md
│
├── scripts/                           # Local dev + deploy scripts
│   ├── dev.sh
│   ├── db-types.sh
│   └── deploy-n8n.sh
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── codeql.yml
│   └── ISSUE_TEMPLATE/
│
├── package.json                       # pnpm workspace root
├── pnpm-workspace.yaml
├── .editorconfig
├── .gitignore
├── .nvmrc
└── README.md
```

## Layer rules

1. `app/` may import from `components/`, `lib/`, `services/`, `hooks/`,
   `types/`.
2. `components/` may import from `lib/`, `types/`. **Never** from
   `services/` or `lib/supabase/admin.ts`.
3. `services/` may import from `lib/`, `types/`. Only `lib/supabase/server.ts`
   (RLS-bound) — **never** the admin client.
4. `lib/supabase/admin.ts` may only be imported from route handlers
   under `app/api/webhooks/**` and from `app/api/auth/register/**`.
5. `lib/stripe/client.ts` and `lib/email/client.ts` may only be
   imported from server code (route handlers, services, n8n
   adapter).
