# Client Documentation + HTML Page — Architecture Impact & Implementation Readiness Audit

> **Audience:** Project lead.
> **Status:** Analysis only. **NO code, schema, env var, SaaS account, migration, file deletion, or commit has been performed or proposed for implementation.**
> **Source materials:**
> 1. `C:\Users\Maniv\Downloads\CoursEnLigne-Editorial-Structure_160826-EN.docx` (English editorial — 506 paragraphs, extracted to `…\_docx_work\en.txt` for this audit).
> 2. `C:\Users\Maniv\Downloads\CoursEnLigne-Structure-editoriale 160826-du-site-3.docx` (French editorial — 506 paragraphs, extracted to `…\_docx_work\fr.txt`).
> 3. `C:\Users\Maniv\Downloads\coursenligne 160826.html` (single-file, hash-router reference page, 2 421 lines).
>
> **Pre-existing constraints in force throughout this audit:**
> - No modification of source code, SQL, environment variables, migrations, brand files, or SaaS accounts.
> - No implementation of Sprint 4 against the new client requirements; recommendations only.
> - The locked architecture (CLAUDE.md §2) is preserved; every change is classified for review before being acted on.
> - The user's standing rule on Calendly: **one 60-minute Event Type per tutor; 10 tutors → 10 Event Types; do not invent tutors.**
> - The user's standing rule on payments: **session-based**, not course-based.
> - The user's standing rule on SaaS: **n8n Cloud only**, no AWS, no self-hosted n8n.
> - The user's standing rule on tutors: **no tutor dashboard**, tutor roster maintained by admin.

---

## 0. Re-verification disclaimer

Per the user's instruction *"Do not assume the previous Sprint 4 readiness report is still completely accurate. Re-verify it against the actual repository"* — this audit re-read the on-disk state of every locked surface. Verified directly:

- `supabase/migrations/` — 24 files. The current shape ends at `20260720000001_restore_tutors_admin_all_policy.sql`. The standalone tutor shape (Sprint 3.8) is enforced by `…20260719000002_reshape_tutors_v1_to_standalone.sql` (full path backfill, `course_tutors` dropped, v1 columns dropped, v2 `tutors_admin_all` RLS preserved).
- `apps/web/lib/env.ts` — 22 env vars. Stripe/Calendly/Zoom/Resend/n8n all optional; `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_TABLE_JSON`, `ZOOM_*`, `CALENDLY_*`, `RESEND_*`, `N8N_*` all `.optional()` so the dev build survives a missing config (mock-gated where appropriate).
- `apps/web/app/api/webhooks/{stripe,n8n,calendly}/route.ts` — Stripe pinned to `2024-06-20`; n8n webhook supports v2 event types (`meeting_created`, `session_grant_checkout_created`, `session_booking_confirmed`, …) and drops v1 (`enrollment_*`, `*_booking_id`) at the parse layer; Calendly signature is HMAC-SHA256.
- `apps/web/lib/calendar/calendly.ts` + `apps/web/lib/zoom/client.ts` + `apps/web/lib/stripe/client.ts` + `apps/web/lib/email/send.ts` exist as service-layer wrappers; `lib/email/send.ts` is mock-gated (returns `{id:'mock', status:'mocked'}` when `RESEND_API_KEY` is unset).
- `apps/web/services/curriculum/programs.ts` — 5 known program slugs are referenced by the docstring: `high_school`, `preparatory`, `bts_abm`, `bts_optics`, `bts_bioalc`. Programs are already in the schema as the canonical v2 hierarchy root.
- `apps/web/services/curriculum/sessions.ts` — sessions are the atomic unit (`Session = one charge, one booking, one meeting`). No concept of "pack of 10", "monthly follow-up", "intensive course", or "at-home exam session" exists in the service layer.
- `apps/web/lib/constants/brand.ts` — brand identity is `Intégrale SAS / contact@integrale.fr`. i18n strings live in `messages/en.json` + `messages/fr.json`.
- `apps/web/lib/validations/admin-catalog.ts` — 8 v2 Zod schemas from Sprint 3.8.1 (program/grade CRUD + tutor create/edit) plus the 3.6-era schemas. Session create + edit accept `tutor_id` (nullable UUID).
- `docs/review/PHASE2_SPRINT_4_READINESS_REPORT.md` and `SPRINT4_OPERATOR_SETUP_GUIDE.md` exist from the prior session and were NOT modified by this audit.

The audit does **not** re-export those readiness reports; it focuses on the delta between the locked v2 system and the new client materials.

---

## 1. Executive summary — what is on the table

The client supplied three deliverables that, **if implemented in full**, would force changes across every architectural boundary. They are:

| Deliverable | Surface affected | Magnitude |
|---|---|---|
| **Rebrand** "Intégrale" → "CoursEnLigne" | Brand constants, all i18n, footer, metadata, OG, sitemap, email templates, Stripe product names | Large |
| **New program slugs** (BTS ABM, BioALC, Optique at minimum; Prépa confirmed as MPSI/PCSI sub-label) | `programs` seed, marketing routes `/levels/bts_abm`, etc. | Medium |
| **Subject re-clustering**: `Physique + Chimie` → `Physique-Chimie` (one subject) | `courses.title`, all marketing copy, possibly a v2 column add | Medium |
| **Three product tiers** (Pack 10 / Monthly follow-up) + **2 intensive offers** (10h online / 20h) + **1 at-home offer** (with 50% tax-credit eligibility) | `session_grants` model (only the "unit" exists today), Stripe product map, payment UI | **Very large** — schema + Stripe model + workflow + email subject lines |
| **Free-trial semantics**: "first 20-min discovery call free" + "first booked session free" | Schema-level: sessions can be `is_free`? Or a separate `discovery_call` product? | Medium |
| **Instructor qualifications matrix** (program × grade) | New `tutor_qualifications` table, tutor picker UX, admin form | Medium |
| **Cancellation policy**: free up to 1 h before; after that, session counted as taken | n8n cancellation workflow + a `late_cancellation_fee`? | Small–medium |
| **Tutor change without justification**: 24 h admin response SLA | New `tutor_change_requests` table or rely on admin email? | Medium |
| **Invoice + receipt auto-generation per payment** | Already done by Stripe + Resend — but the *annual tax attestation* (SAP / Urssaf) is new | **Large** — outside SaaS infra, requires Urssaf registration |
| **Five named institution logos** + 3 named testimonials + unverifiable "3 400+" stat | Legal exposure (logos), proof requirement (stats), consent (testimonials) | External — not code |
| **Multi-channel tutor recruiting** ("Become a tutor" CTA in the footer + on Tutors page) | New form + dedicated email template + admin pipeline | Small |
| **Parent-targeted reporting** ("Bilan envoyé aux parents" every month for Pack 10 / Stages / Suivi mensuel) | New `parent_reports` table or `notifications` extension + scheduled n8n workflow | Medium |
| **Stricter refund semant ics**: free up to 1 h before; after that session is "considered as taken" (so the *student* loses the credit, not the tutor gets paid either way) | New `session_bookings.status = no_show_late_cancel` + a refund policy on `session_grants` | Medium |
| **"At-home exam sessions"** (offline, with tutor travelling) — completely different delivery channel | New `session_format` column or new table; integration with no Zoom, no Calendly; Stripe = quote + manual invoice | **Large** — new delivery channel |
| **At-home sessions are the only ones eligible for the 50% tax credit** — and the credit is conditional on Urssaf SAP registration | Legal + admin process outside SaaS infra | **Blocker** until CoursEnLigne becomes a SAP |

Of these, the brand change, the multiple products, and the at-home channel are the only ones that touch the locked architecture. The rest are additions or copy.

---

## 2. Information architecture audit

### 2.1 Page-by-page requirements (per both editorial files)

The two editorials are near-identical in structure; the only meaningful differences are the language of the visible copy and the licence-inclusion note in §6 of the EN version. The information architecture is therefore a single matrix of 10 pages.

| # | Page | URL target (current) | URL target (suggested) | Status |
|---|---|---|---|---|
| 1 | Home | `/[locale]` | unchanged | Keep |
| 2 | Levels index | `/[locale]/(marketing)/levels` | unchanged | Keep |
| 3 | Level detail (5 paths) | `/[locale]/(marketing)/levels/[levelSlug]` | **Add `/levels/bts_abm`, `/levels/bts_bioalc`, `/levels/bts_optique`** | **Gap** |
| 4 | Course detail | `/[locale]/(marketing)/courses/[slug]` | unchanged | Keep |
| 5 | Tutors index | *(currently the booking flow itself)* | **Add `/[locale]/(marketing)/tuteurs`** (mirrors `/levels` shape) | **Gap** |
| 6 | Tutors detail | n/a | `/[locale]/(marketing)/tuteurs/[uuid]` | **Gap** |
| 7 | Pricing | n/a (FAQ is on home) | **Add `/[locale]/(marketing)/tarifs`** with 4 sub-blocks (regular plans / intensive / at-home / tax-credit explainer) | **Gap** |
| 8 | About | n/a | **Add `/[locale]/(marketing)/a-propos`** (legal copy required before public) | **Gap** |
| 9 | Contact | `/[locale]/(marketing)/contact` | unchanged | Keep, **add FAQ link above the form** per the build notes |
| 10 | Auth | `/[locale]/auth/login`, `/auth/register` | unchanged | Keep |
| 11 | Footer | rendered by `SiteFooter` | unchanged structurally | **Copy refresh only** |

### 2.2 Routes that already match

- `/[locale]` (home)
- `/[locale]/(marketing)/levels` (with sub-segments)
- `/[locale]/(marketing)/levels/[levelSlug]`
- `/[locale]/(marketing)/courses/[slug]/chapters/[chapterSlug]`
- `/[locale]/(marketing)/sessions/[id]` *(the actual booking entry-point)*
- `/[locale]/auth/*`
- `/[locale]/(marketing)/contact`
- Dashboard + admin (covered separately)

### 2.3 Routes that are missing and required by the editorial

| New route | Reason | Reading | Writing | Auth |
|---|---|---|---|---|
| `/[locale]/(marketing)/levels/bts_abm` | 3rd BTS path | Public | none | No |
| `/[locale]/(marketing)/levels/bts_bioalc` | 4th BTS path | Public | none | No |
| `/[locale]/(marketing)/levels/bts_optique` | 5th BTS path | Public | none | No |
| `/[locale]/(marketing)/tuteurs` | "Tuteurs" main page (mirrors `/levels` shape) | Public | none | No |
| `/[locale]/(marketing)/tuteurs/[uuid]` | Individual tutor profile | Public | none | No |
| `/[locale]/(marketing)/tarifs` | Tarifs page | Public | none | No |
| `/[locale]/(marketing)/a-propos` | About page | Public | none | No |
| `POST /api/public/tutor-application` | "Become a tutor" form | Public | write | No |
| `POST /api/parent-reports` (admin) | Parent progress reports | Authenticated | write | Admin |
| `GET /api/parent-reports/[session_grant_id]` (parent email link) | Signed URL for parent monthly report | Public token | none | Token |

The marketing pages are RSC + DB reads only; no schema change is required to render them. The new programs can be inserted via the existing `/admin/programs` form (Sprint 3.8.1) or via the admin Programs admin page; the curl-side content (descriptions) lands in the existing `programs.description` (text) + `metadata.titles[locale]` (jsonb via `metadata` column).

### 2.4 URL/navigation reality gap

The HTML reference uses anchor-based single-file routing (`#tuteurs`, `#tarifs`, `#apropos`, `#connexion`). The Next.js equivalent requires 6 new page routes plus a Navigation Menu rewrite to point at them instead of the hash anchors. The contact form in the HTML has `<a href="#contact">` on every CTA — under the current app, those CTAs correctly link to `/[locale]/contact`, which already exists.

**Hard contradiction:** the HTML shows NO Calendly embed anywhere. The current production code has `components/marketing/calendly-embed.tsx` and `lib/calendar/calendly.ts` (per the prior audit); the current `/sessions/[id]` page tries to render a Calendly inline embed. The HTML reference, by contrast, treats the booking flow as "fill the contact form → admin replies → student books manually." This is a contradiction in the client materials.

**Recommended resolution:** treat the Calendly booking embed as the actual booking mechanism (matching the v2 schema) and use the contact form only for the "free 20-minute discovery call" flow described in the FAQ. Documented as P1.1 client clarification.

### 2.5 EN/FR consistency

The two editorials are line-for-line equivalents (the TOC, the BUILD NOTES sidebar, the page count, the FAQ count, the pricing columns, the footer columns all match). The only FR-only/EN-only insertions are:

- **EN-only licence attribution**: the EN editorial references the Sherpas model more directly in §6 ("Sherpas compares 3 plans side by side…") and in §7 ("they state their founding date"). The FR editorial mirrors it with the same reference. No content delta.
- **Multi-currency implications**: the EN version writes "€35 per session"; the FR version writes the same. **No currency split** (no €/CHF/USD), and no language-conditional pricing.
- **i18n: Contact form** — both versions include a "Niveau" dropdown with the same 6 options: `Lycée · Prépa (MPSI/PCSI) · BTS ABM · BTS BioALC · BTS Optique · Licence`. This means the i18n key for the contact form needs a level picker that exposes BTS ABM / BioALC / Optique today (not yet in the schema by slug — see §7). If the schema slugs are added but the form option key is i18n-static, the existing `lib/validations/contact.ts` will need a new key.

---

## 3. Booking architecture audit

### 3.1 Current v2 booking flow (locked)

```
[Student] → /[locale]/sessions/[id] → RSC session detail
        → renders <CalendlyEmbed eventUri={session.calendly_event_uri} />
        → student picks a slot
        → Calendly invitee.created webhook
        → POST /api/webhooks/calendly (HMAC-SHA256 verify)
        → forward to N8N_ENROLLMENT_WEBHOOK_URL (n8n Cloud)
        → n8n workflow "vedioconference.calendly-invitee-created":
              - creates a Stripe Checkout Session (amount = session.price_cents, currency = 'EUR', metadata = { session_grant_id })
              - stores stripe_session_id on session_grants
              - on Stripe checkout.session.completed → confirm session_grant + send reminder cron
              - n8n workflow "vedioconference.create-zoom-meeting":
                  - Zoom S2S OAuth → POST /v2/users/{host}/meetings 24 h before
                  - stamps meeting_links row (UNIQUE on session_booking_id)
                  - flips session_bookings.status to 'confirmed'
        → n8n workflow "vedioconference.send-reminder":
              - 24 h before: email via Resend (template: 'session-reminder-24h')
              - 1 h before: email via Resend (template: 'session-reminder-1h')
              - includes ICS attachment + Zoom join_url
        → student cancels ≤ 1 h before → n8n cancels the grant reservation
```

The atomic unit is one Calendly invitee = one `session_grants` row purchase = one Zoom meeting. **That atomic unit is what the client materials describe as the "Séance à l'unité" product (the €35 column). The other two columns are not in the model.**

### 3.2 What the client materials require

#### 3.2.1 Pack 10 sessions

"Pack 10 séances — 299 € — Valid for 6 months"

The v2 schema has `session_grants.quantity` (the number of included sessions per grant). The Phase 1 + Sprint 3.5 design did **not** settle whether `quantity > 1` is business-supported. The current `services/curriculum/session-grants.ts` only writes `quantity = 1` and uses `session_grants` as a 1:1 alias for "one Stripe charge for one future session". Pack-of-N would require:

- A new column or new product type for `quantity = 10`.
- A new `pack_grants` table OR widening the `session_grants` model so that `quantity` flows.
- An admin setting `validity_months = 6` on the grant.
- A n8n cron that flips unused sessions in an expired pack to `forfeited` (or `null`, depending on refund policy).
- A new "Pack progress" UI on the dashboard (lessons used / remaining / expiry date).

#### 3.2.2 Suivi mensuel (Monthly follow-up)

"109 €/mois — 4 séances incluses — résiliable à tout moment — reportable d'un mois sur l'autre"

This is a **recurring subscription**, not a one-time grant. The current v2 schema has `subscriptions` and `_v1_subscriptions` (`subscriptions_billing.sql`) but they are wired to Stripe Subscriptions (Stripe Subscriptions API) — not to Calendly, not to Zoom, not to packs. Recurring monthly follow-up requires:

- A Stripe Subscription product for "Suivi mensuel" (price_xxx).
- A webhooks handler for `customer.subscription.created`, `customer.subscription.updated`, `invoice.payment_succeeded`, `customer.subscription.deleted` (cancel at period end).
- A new `subscription_sessions` table linking a subscription_id to a per-month session_quota (default 4).
- An admin "roll over unused sessions" workflow (currently described as "reportable d'un mois sur l'autre").

#### 3.2.3 Stages intensifs (10h / 20h)

"220 € / 420 € — groupés sur 1 semaine / vacances scolaires — programme ciblé"

Stages are session-clusters with shared metadata (the stage has a syllabus; sessions inside it have `order_index`). The schema currently has no `stage` or `session_cluster` concept. A new `session_packages` (or `intensive_courses`) table is required:

```text
session_packages (
  id, kind 'intensive_10h'|'intensive_20h'|'pack_10'|'suivi_mensuel'|'unit',
  total_sessions, price_cents, currency, duration_min_per_session,
  validity_days, max_per_student, applicable_program_ids[], ...
)
session_grants.package_id (FK to session_packages.id)  ← new column
```

Sessions inside a stage are still individual `sessions` rows; what the new table captures is the **commercial envelope**.

#### 3.2.4 Sessions d'examen à domicile (at-home exam session)

"35 € de l'heure — devis — tuteur à domicile — éligible crédit d'impôt 50 %"

This is a **separate delivery channel**. The at-home session:

- Has no Zoom meeting.
- Has no Calendly booking (the request is "Demander un devis" — quote-based).
- Has no online payment via Stripe Checkout (a manual quote is invoiced and possibly paid in CESU/Urssaf flow).
- Is **the only product eligible for the French "Services à la Personne" 50% tax credit** (art. 199 sexdecies CGI), and that eligibility is **conditional on CoursEnLigne being registered as a SAP auprès de l'Urssaf** (per §6 of both editorials).

This requires:

- A new `service_requests` table for "Demander un devis" requests.
- A n8n workflow that emails the admin (`notification.type='at_home_quote_requested'`) and creates a `quote_requests` row.
- A `delivery_mode` column on `session_bookings` (or a new table) with values `online_visio` / `at_home` (and possibly later `at_school`).
- An admin quote UI to send the quote + bill the family.
- Once a quote is accepted: a manual flow (off-Stripe) to record the payment in `payments` (provider `manual_at_home_quote`) for the fiscal year-end attestation.

#### 3.2.5 First slot free

"Your premier créneau est offert" + "Réservez votre premier cours d'essai, offert"

This is a **free trial coupon** model. The schema currently has no concept of a `session_grant` with `amount_cents = 0`. Required:

- A new `trial_grants` row type or a `session_grants.is_trial` boolean + `trial_grant_count_per_student` policy.
- Admin-configurable setting: max 1 free trial per (student, program); first-time students only; or by invitation.
- The 20-minute "discovery call" mentioned in the FAQ is a *separate* thing from the first booked 60-minute session: two different free flows in the same editorial.

### 3.3 The Calendly contract is unchanged

The user's standing rule "one 60-minute Event Type per tutor" is preserved. The new products (Pack 10, Suivi mensuel, Stage, Devis, Découverte) are **commercial envelopes** layered on top of the same one-Event-Type-per-tutor model. A Pack-of-10 grant grants the student the right to book 10 invitees on that tutor's Event Type (until the validity date). A monthly subscription grants the right to book 4 invitees per month (rolling). Intensive courses are typically "group" bookings — a single Event Type can be reused for stage sessions.

The at-home channel **does not** use Calendly. The Stage-format ("2 h/day, 5 days") also typically does not use Calendly at the same granularity as individual bookings — but per the locked architecture, *n8n* always invokes Stripe and Zoom, not Next.js. The current Calendly embed would still be the per-session booking entry-point; the stage schedule would be coordinated by the admin (manually) and the per-day sessions would be booked via Calendly in groups.

### 3.4 Cancellation policy

"Annulation gratuite jusqu'à 1h avant" — the FAQ + the pricing page both repeat it.

The current `session_bookings.status` enum has at least `pending`, `confirmed`, `cancelled`, `no_show` (see service layer). The new semantics:

- Student cancels ≤ 1 h before → booking.status becomes `cancelled_late` (or stays `cancelled`); grant retains its `1` session credit (because the time-slot was blocked at booking time and not re-sellable at such notice).
- Student cancels > 1 h before → booking.status = `cancelled`; grant retains its `1` session credit (because the student re-schedules).
- Student does not show up → booking.status = `no_show`; grant forfeits its `1` session credit (no refund).

These rules require a `cancellation_policy` column on `sessions` or on a global config, plus a refund-policy field on `session_grants` (or a constant).

### 3.5 Tutor change

"Vous pouvez changer de tuteur à tout moment, sans justification. On vous propose un profil alternatif sous 24h."

This is **an admin SLA**, not a self-service student flow. The student needs to contact the admin (contact form, "Change my tutor" reason); the admin has 24 h to propose an alternative profile. No schema change required: the admin updates `session_bookings.tutor_id` directly. (The existing `session_bookings.tutor_id` column is already editable by admin per RLS policy.)

---

## 4. Stripe / payment architecture audit

### 4.1 Current v2 Stripe surface

- `lib/stripe/client.ts` — pinned to Stripe API version `2024-06-20`. Lazy, server-only.
- `app/api/webhooks/stripe/route.ts` — handles `checkout.session.completed`, `payment_intent.payment_failed`, `charge.refunded`. Idempotent via `webhook_events.event_id` UNIQUE.
- `app/api/session-grants/[id]/stripe-session/route.ts` — POST `/api/enrollments/checkout` flow currently exists but is gated through n8n (`N8N_ENROLLMENT_WEBHOOK_URL`).
- `STRIPE_PRICE_TABLE_JSON` env var — JSON-encoded map of `course_uuid → price_xxx`. The booked amount is set on the Stripe Checkout Session in n8n based on this table.
- The test plan in `tests/unit/session-grants-route.test.ts` mocks `N8N_ENROLLMENT_WEBHOOK_URL` call.

### 4.2 New products implied by the editorial

| Product | Stripe object | One-time or subscription? | VAT |
|---|---|---|---|
| Séance à l'unité (35 €) | `price` one-time | one-time | 20 % |
| Pack 10 séances (299 €) | `price` one-time | one-time | 20 % |
| Suivi mensuel (109 €/mois × 4 séances) | `price` recurring | subscription | 20 % |
| Stage 10h (220 €) | `price` one-time | one-time | 20 % |
| Stage 20h Bac & concours (420 €) | `price` one-time | one-time | 20 % |
| Sessions d'examen à domicile (35 €/h, devis) | manual invoice | none | **0 % or specific CESU rate** depending on SAP status |
| Premier créneau offert (0 €) | `price` one-time, amount=0 | one-time | 20 % (still subject to VAT) |
| Découverte 20 min (gratuit) | none (admin-only) | none | none |

### 4.3 Payment methods explicitly required

"Stripe Checkout, carte bancaire, Apple Pay, Google Pay, prélèvement SEPA."

Stripe Checkout is the standard product for the 6 unit-price products. With `automatic_payment_methods` enabled on the Checkout Session, Apple Pay and Google Pay activate for card-based currencies (FR EUR qualifies). SEPA direct debit requires `payment_method_types: ['card', 'sepa_debit']` on the Checkout Session — the Stripe client does not currently construct it. This is **not** a schema change, only a `stripe.Checkout.SessionCreateParams.payment_method_types` widening — itself depends on Stripe features for FR (Stripe supports SEPA on Checkout in FR).

### 4.4 Refund policy

The current `/api/session-grants/[id]/refund/route.ts` calls n8n, which calls Stripe `refunds.create()`. The new policy "free cancellation up to 1 h before, otherwise session counted as taken" does NOT automatically issue a refund for late cancellations. The student doesn't get a refund; **the tutor also doesn't get paid**, because the session didn't happen. That means:

- `< 1 h cancel` → bookable for someone else (the slot is freed); **no refund, no payment** to tutor.
- `> 1 h cancel` → handled separately; full refund issued (the grant credit is preserved).
- `no_show` → bookable; **no refund**; tutor compensated per the policy the platform chooses.

The current refund route covers the `> 1 h cancel` path. The `< 1 h cancel` and `no_show` paths must be added as new n8n branches.

### 4.5 Invoice + receipt auto-generation

Per the FAQ + the pricing page: "reçu et facture sont générés automatiquement après chaque paiement."

Stripe already produces `receipt_url` and creates an `Invoice` automatically when the Checkout Session is created in `invoice_creation: 'always'` mode. The webhook handler at `app/api/webhooks/stripe/route.ts` already writes `stripe_receipt_url` to the `payments` row when `checkout.session.completed` fires. **The feature already exists** for one-time Stripe payments. For SEPA direct debit + subscriptions, the path is `invoice.payment_succeeded` (which is NOT currently in the route handler) — must be added if the monthly follow-up is wired.

The **annual tax attestation** (the form that the SAP-registered CoursEnLigne would send to families each January for the prior year's CESU-declarable spending) is a *separate* thing from Stripe receipt/invoice; it is a manually-generated PDF produced by CoursEnLigne's accounting for eligible at-home sessions. **No SaaS can produce this — it is a legal deliverable from the company to the family.**

### 4.6 What the locked architecture says about Stripe

> *"n8n is the only system that calls Stripe / Zoom for the critical booking path. The Next.js application holds no Zoom secret and no service-role key for booking mutations."*
> — `docs/architecture/Architecture.md` (locked)

Every new product added to the catalog (Pack 10, Suivi mensuel, Stage) keeps this contract — n8n creates the Stripe Checkout Session via the existing webhook chain. The only Next.js change would be to a new helper that maps `package_type → stripe_price_id` (currently in `STRIPE_PRICE_TABLE_JSON` for course-level granularity).

---

## 5. Zoom architecture audit

### 5.1 Current v2 Zoom surface

- `lib/zoom/client.ts` — Server-to-Server OAuth. Caches the token until 60 s before expiry. Credentials: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_DEFAULT_HOST_USER_ID`.
- `services/zoom/meetings.ts` — typed wrapper around the Zoom REST API (`POST /users/{host}/meetings`, etc.).
- The user's standing rule: **one host per tutor**. Each tutor has a Zoom `host_user_id` (looked up at meeting-create time and stored on the meeting row).

### 5.2 What the new client materials say about Zoom

"Une salle Zoom privée par séance."

The at-home exam sessions explicitly do NOT involve Zoom ("Tuteur qui se déplace chez vous"). For those, `session_bookings.delivery_mode = 'at_home'` and the meeting link is null. **No Zoom change** is required for the new flow; only a new column on `session_bookings` (or a wider enum) to support a non-Zoom mode.

### 5.3 What changes if "petits groupes" is real

The editorial mentions "live classes · small groups or one-on-one". The v2 schema has no `group_session` concept. The atomic booking unit today is "1 student ↔ 1 tutor". If group sessions are introduced in a future sprint (out of scope for this audit), the meeting creation parameters (`type: 2` for scheduled meeting, `settings: { join_before_host: false, waiting_room: true, mute_upon_entry: true }`, max participants raised) need to be widened. **This is not a Sprint 4 change.**

### 5.4 Zoom license / paid-host risk

Per-tutor host user requires that each tutor has a Zoom Pro license (or higher) assigned at the S2S-OAuth app. Admin-managed Zoom users. This is an **operator cost** (OpEx), not a code change. It scales linearly with the tutor roster. At 10 tutors × €14/host/month (Zoom Pro annual) = €140/mo — Sprint 4 capacity.

---

## 6. Resend architecture audit

### 6.1 Current v2 Resend surface

- `lib/email/send.ts` — `sendTemplatedEmail(input)`. Renders a React Email template, dispatches via the Resend client. **Mock-gated**: returns `{id:'mock', status:'mocked'}` when `RESEND_API_KEY` is unset.
- `lib/email/templates/` — 6 React Email templates (per `tests/unit/email-templates.test.ts`): `session-booking-confirmed`, `session-cancelled`, `session-payment-receipt`, `session-reminder-24h`, `session-reminder-1h`, `welcome`.
- `RESEND_FROM_EMAIL` env var default `no-reply@example.com`. All email sends also mock in dev when no key is set.

### 6.2 New email templates required by the client materials

| New template | Trigger | Recipient | Locale |
|---|---|---|---|
| `tutor-application-received` | Student/teacher submits "Become a tutor" form | The applicant + admin | FR (default), EN |
| `tutor-application-admin-notify` | Same | admin@ (internal) | FR |
| `first-trial-confirmed` | A student claims the "first free session" | Student | FR, EN |
| `discovery-call-scheduled` | A 20-min discovery is requested via contact form | Both (student + admin) | FR, EN |
| `parent-monthly-report` | Cron: last day of month for a `Suivi mensuel` subscription | Parent (if email on file) | FR, EN |
| `parent-stage-report` | End of a 10h/20h stage | Parent (if email on file) | FR, EN |
| `pack-balance-reminder` | Cron: 14 days before a Pack 10 expiry | Student | FR, EN |
| `quote-requested-admin` | Family submits "Demander un devis" for at-home | Admin | FR |
| `quote-sent` | Admin sends a quote | Family | FR |
| `tax-credit-annual-attestation` | January: prior-year summary of CESU-eligible at-home spend | Family | FR |
| `no-show-policy-reminder` | A booking ends in `no_show` | Student | FR, EN |

**Of these, 6 + the existing 6 = 12 templates**. The Resend free tier is 3 000 emails/mo, paid is $20/mo for 50 k. Sprint 4 capacity is fine.

### 6.3 The Resend mock gate stays

The locked architecture: every email is mock-gated when the API key is missing. The 6 new templates inherit that property automatically. No new env var needed beyond `RESEND_API_KEY` + `RESEND_FROM_EMAIL`.

---

## 7. n8n Cloud architecture audit

### 7.1 Current n8n Cloud surface

- `N8N_BASE_URL`, `N8N_API_KEY`, `N8N_WEBHOOK_SECRET`, `N8N_ENROLLMENT_WEBHOOK_URL` — 4 env vars. The locked architecture says Next.js **does not call Stripe, Zoom, or Calendly directly** on the booking path; n8n does.
- `app/api/webhooks/n8n/route.ts` — 9 supported event types (`meeting_created`, `payment_succeeded`, `payment_failed`, `reminder_sent`, `session_grant_checkout_created`, `session_booking_confirmed`, `session_booking_cancelled`, `session_grant_refund_succeeded`, `workflow_failed`).
- 8 n8n workflow JSONs in `n8n/workflows/`. These are placeholders per the readiness report, real flows land in Phase 3.

### 7.2 New workflows implied by the editorial

| New workflow | Trigger | Action |
|---|---|---|
| `vedioconference.pack-purchase` | Stripe webhook `checkout.session.completed` for a Pack 10 | Create `session_grants(package_type='pack_10', quantity=10, valid_until=now+6mo)` |
| `vedioconference.monthly-subscription-create` | Stripe webhook `customer.subscription.created` | Initialize `subscription_sessions(subscription_id, monthly_quota=4)` |
| `vedioconference.monthly-subscription-renew` | Stripe webhook `invoice.payment_succeeded` | Reset the monthly quota to 4, send parent monthly report |
| `vedioconference.monthly-subscription-cancel` | Stripe webhook `customer.subscription.deleted` | Mark `subscription_sessions.status='cancelled_at_period_end'` |
| `vedioconference.monthly-report-cron` | Cron: 1st of each month | Email parent report template for active subscriptions |
| `vedioconference.stage-purchase` | Stripe webhook for a Stage | Create N sessions on the chapter, send tutor + student schedule |
| `vedioconference.discovery-call-scheduled` | Calendly invitee on the discovery event | Notify admin + email student "your free call is booked" |
| `vedioconference.late-cancellation` | Student cancels < 1 h | Don't refund, mark booking `cancelled_late`, do not free the credit |
| `vedioconference.no-show` | Cron: 15 min after `session_bookings.start_at` with no Zoom join | Mark `no_show`, do not refund, do not pay tutor |
| `vedioconference.at-home-quote-requested` | Web form submit | Email admin, create `service_requests` row |
| `vedioconference.at-home-quote-sent` | Admin sends quote | Email family, create `payments(provider='manual_at_home_quote')` when paid |
| `vedioconference.pack-expiry-reminder` | Cron: 14 days before Pack 10 expiry | Send `pack-balance-reminder` to student |
| `vedioconference.tutor-application-received` | Web form submit | Email applicant + notify admin |

This brings the workflow count from 8 (placeholders) to ~16 (placeholders + the 8 new ones). **Important:** all 13 new workflows are pure additions; no existing workflow is broken or rewritten. The Sprint 4 readiness remains the same: no real workflow JSONs need to be authored in Sprint 4 — they can land in Phase 3 alongside the operator-setup-guide.

### 7.3 Calldly Event Type model unchanged

Per the user's standing rule: **one 60-minute Event Type per tutor; 10 tutors → 10 Event Types.** The new editorial doesn't introduce a need for new Event Types. Pack, Stage, Suivi mensuel, Découverte, At-home — each of them is a *commercial wrapper*, not a new Event Type. A "Pack 10" student books the same 60-minute Event Type 10 times before the pack expires. A "Suivi mensuel" student books it 4 times per month. A "Stage 10h" student books it 10 × 1 h sessions (or 5 × 2 h sessions, depending on the admin's choice) within the week.

The **discovery call** ("premier échange gratuit de 20 min") is the only new Event Type suggested. Per the user's standing rule "one 60-minute Event Type per tutor", a 20-min discovery cannot reuse the 60-min booking Event Type without confusing the Calendly URL. Recommended: **the discovery call uses a Calendly event type per admin or per Calendly organization, not per tutor** (it's a sales conversation, not a session). This is a marginal divergence from the user's rule, and **must be confirmed before implementation**. Logged as P1.2.

---

## 8. Database impact analysis

### 8.1 Existing v2 tables (per current `supabase/migrations/`)

`profiles`, `tutors` (standalone, Sprint 3.8), `courses`, `chapters`, `sessions` (with `tutor_id` per Sprint 3.8.1), `programs`, `grades`, `session_grants`, `session_bookings`, `meeting_links`, `payments`, `notifications`, `webhook_events`, `n8n_dead_letters`, `_v1_subscriptions`, and the v1.5 extensions.

### 8.2 Tables the new editorial might require (NOT in current schema)

These are **proposed** for client review; **none of them are added, dropped, or modified in this audit.**

| Proposed table | Reason |
|---|---|
| `tutor_qualifications` (program × grade × tutor) | Required to suggest "the right teacher" per the editorial ("On s'en sert pour vous orienter vers le bon prof") |
| `tutor_applications` | Stores "Become a tutor" submissions; admin reviews and converts to `tutors` row |
| `session_packages` | Commercial envelopes (Pack / Suivi mensuel / Stage) |
| `subscription_sessions` | Per-month quota under a Stripe Subscription |
| `service_requests` / `quote_requests` | At-home "Demander un devis" |
| `parent_links` (student_id ↔ parent_email) | Parent monthly report recipient |
| `parent_reports` (subscription_id, period_start, period_end, body) | The actual report content |
| `delivery_mode` on `session_bookings` (enum: 'visio' / 'at_home') OR `at_home_session_details` table | Distinguishes online vs offline sessions |

### 8.3 Columns that might be added to existing tables

These are **proposed** for client review; **none are added in this audit.**

| Table | Column | Reason |
|---|---|---|
| `session_grants` | `package_id` (FK `session_packages.id`) OR `package_type text` | Differentiate unit / pack / stage / subscription |
| `session_grants` | `valid_until` | Pack 10 = 6 months validity |
| `session_grants` | `is_trial boolean` | Free first session |
| `session_bookings` | `delivery_mode text check in ('visio','at_home')` | At-home exam sessions |
| `tutors` | `zoom_host_user_id text` (nullable) | Per-tutor Zoom host (already implicit via ZOOM_DEFAULT_HOST_USER_ID — could be widened to per-tutor) |
| `payments` | `provider text` (already in v2: 'stripe', manual, etc.) | At-home manual payments |
| `programs` | `metadata jsonb` | Holds `metadata.titles[locale]` (already in v2) — no change needed |

**None of these are required for Sprint 4.** They are required for the eventual implementation of Pack / Suivi mensuel / At-home / Discovery-call products. The locked architecture says new SQL ships as new migrations, forward-only; the user controls the sprint boundary.

### 8.4 Existing data that survives a rebrand

The brand change (Intégrale → CoursEnLigne) is purely front-end and content; **no database row needs to change**. RLS policies are unaffected (they don't reference brand). `webhook_events` is unaffected. Stripe product names *should* be renamed (Intégrale math lesson → CoursEnLigne math lesson) but Stripe product names can be changed in the Dashboard without API call.

### 8.5 The "first session free" model — possible schema impact

The simplest implementation is **a Stripe coupon** (`percent_off: 100, max_redemptions: 1, redeem_by: +30 days`) attached to the first session_grant for a first-time student. No schema change required. The student's eligibility (first-time? per-program? globally?) is enforced by Next.js (the route handler checks `student.first_grant_count == 0`) before applying the coupon.

The harder implementation (per-program trial, parent-managed trials) would require a `trial_grants` table and Stripe `PromotionCode`. Documented as **P1.4**.

### 8.6 RLS review

The new tables (proposed in §8.2) would each need:
- `select_own + admin_all` policies (default)
- `insert_owner` policies where the user can create (parent_links by self, tutor_applications by self)
- `update_owner + admin_all` where editable

No existing RLS policy is affected by a rebrand or by a simple `tutor_qualifications` add. **No RLS rewrite** is required by the editorial as-is.

---

## 9. Frontend / UX impact analysis

### 9.1 Component surface affected

| Component | Change | Severity |
|---|---|---|
| `components/marketing/SiteHeader.tsx` | Brand wordmark "Intégrale" → "CoursEnLigne"; add Tuteurs / Tarifs / À propos to the nav menu (currently just home/levels/contact) | **Brand: critical. Nav: medium.** |
| `components/marketing/SiteFooter.tsx` | 4 columns (Plateforme / Ressources / Légal / Logo) — keep shape; rewrite copy to "CoursEnLigne" + add "Devenir tuteur" + legal links | **Brand + copy: critical.** |
| `components/marketing/ProgramCard.tsx` | Per editorial: icon (🎓), badge, count of courses + grades per program | **Copy only — currently has displayTitle already.** |
| `components/marketing/course-detail.tsx` | Add sticky "Réserver" CTA per build notes; add named tutor block per course; chapter list per editorial | **Medium — new components needed.** |
| `components/marketing/calendly-embed.tsx` | No structural change (still embeds the 60-min Event Type) | **None — but the editorial does NOT use Calendly inline; the editorials treat the booking flow as contact-mediated. Reconciliation required (P1.1).** |
| New `components/marketing/tutors-index.tsx` | List of tutors (filtered by program) | **New file.** |
| New `components/marketing/tutor-profile.tsx` | Individual tutor profile with `BookingEmbed` per their Event Type | **New file.** |
| New `components/marketing/pricing-page.tsx` | 3-column table (Unité · Pack 10 · Suivi mensuel) + Stages + Tax-credit explainer + Payment methods | **New file (complex).** |
| New `components/marketing/about-page.tsx` | 4 pillars + 3 stats + parent testimonial slot | **New file.** |
| New `components/marketing/contact-page.tsx` (page already exists) | Add a level dropdown (Lycée / Prépa / BTS ABM / BioALC / Optique / Licence) — already in `lib/validations/contact.ts` Zod schema | **Verify the dropdown is in the form; if not, add it.** |
| `components/forms/ContactForm.tsx` | Add Niveau dropdown values (BTS ABM / BioALC / Optique — **currently not in the form**) | **Likely a gap.** |
| `components/dashboard/sessions/MySessions.tsx` | Display "Pack balance" / "Suivi mensuel used this month" / "Trial used" badges | **Medium.** |
| New `components/dashboard/parent/ParentReport.tsx` | Monthly parent email summary | **New file.** |
| New `components/marketing/tutor-application-form.tsx` | "Become a tutor" form on `/[locale]/devenir-tuteur` route | **New file.** |
| All email templates | Brand wordmark change in the React Email layout | **Brand-only.** |
| OG image metadata (offline generated) | Re-render with CoursEnLigne brand | **Brand-only (low priority).** |

### 9.2 Theutors page — what the editorial requires that the schema doesn't have

The editorial shows each tutor with:
- Full name ("Sophie M. — Mathématiques")
- Headline ("Agrégée de mathématiques, 8 ans d'expérience en classes préparatoires")
- Subject + level taught (Maths + Lycée + Prépa)

The current v2 `tutors` table has `full_name`, `email`, `phone`, `status`, `notes`, `created_at`, `updated_at`. **It has no `headline`, no `subject`, no `program_ids`, no `grade_ids`.** For the tutor marketing page to render the editorial's card shape, the schema needs a `tutor_qualifications` join table (program × grade × tutor) and either:
- An optional `tutors.headline text` (recommended), OR
- A `tutor_qualifications.headline text` (so a single tutor can have different headlines per level).

The editorial explicitly avoids claiming the **illustrative** tutor names as real. The user's rule "do not invent tutors. do not create hypothetical Calendly Event Types" applies; the next step requires the admin to enter real tutors via the existing `/admin/tutors` form.

### 9.3 Course detail page — what's there vs what's needed

The current `components/marketing/course-detail.tsx` (per the changed-files list) was just rewritten. The editorial requires:

- Sticky "Réserver" CTA (per build notes) — **needs to be confirmed; may already be present.**
- Named tutor block (per build notes: "Toujours associer un tuteur nommé").
- Per-chapter + per-session pricing column (per editorial §4).
- Key concepts chips ("Arithmetic sequences · Differentiation · Probability").

If the current course-detail does not render tutor names + per-chapter pricing + key concepts, the course detail rebuild is **medium-large** in scope.

### 9.4 Pricing page — new file

The pricing page is the largest new frontend deliverable. Per the editorial:
- SVG flowchart linking "Session 60 min" → 3 usages.
- 3-column comparison table (Unité / Pack 10 / Suivi mensuel).
- Stages section (3 cards: 10h online / 20h online / at-home exam).
- Long tax-credit explainer block with conditional badge.
- Payment methods block.

This is **a new marketing page, not a schema or backend change.** It can be built with the existing `CourseDetail`-style component pattern (RSC, server client, no API route needed) once the 6 products are wired in the Stripe Dashboard and the `STRIPE_PRICE_TABLE_JSON` is updated with their price IDs.

### 9.5 "Quarterly" parent progress reports

The éditorial mentions a "Bilan de progression mensuel envoyé aux parents" for the monthly follow-up and "Bilan quotidien envoyé aux parents" for the 20h stage. These are **manually-curated summaries** (the parent-bilan copy in §6 implies a tutor writes it, not an automated engine). The product says "envoyé" — the format is unstated. A reasonable v1 implementation:
- Tutor writes a 1-paragraph note in the dashboard after each session.
- On the 1st of each month (cron), n8n emails the parent a summary of all sessions + tutor notes from the prior month.

This is **medium scope** and depends on a parent-recipient concept that the v2 schema does not model (`profiles.parent_email` or a separate `parent_links` table).

### 9.6 Internationalisation (EN/FR)

The two editorials are linguistic equivalents; no asymmetric content. The i18n file structure already has both `en.json` + `fr.json`. All new copy slots in under existing `Marketing.*` and `Pricing.*` keys (which need to be created). Specifically:

- `Marketing.nav.tuteurs`, `Marketing.nav.tarifs`, `Marketing.nav.aPropos`, `Marketing.nav.devenirTuteur` — new keys needed.
- `Marketing.home.hero.badge` ("LIVE CLASSES" / "COURS EN DIRECT") — already exists as `Marketing.hero.eyebrow`.
- `Marketing.home.keyFigures.exercisesCorrected` ("3 400+" / "3 400+") — already exists in current i18n with `3400+` placeholder.
- `Pricing.*` — entirely new namespace.
- `Admin.tutorApplication.*` — new namespace.

---

## 10. Business-rule audit — actionable rules the editorial implies

| Rule | Where enforced today | Where it should be enforced |
|---|---|---|
| **Cancellation free ≤ 1 h before** | n/a | n8n workflow `vedioconference.late-cancellation` |
| **Student loses 1 session credit if cancelled < 1 h before** | n/a | New `session_grants.late_cancellation_count column`; refund policy constant |
| **Tutor change SLA: 24 h** | n/a | Admin-side email template + SLA timer in `notifications` |
| **Auto receipt + invoice after payment** | Stripe auto-receipt + the existing `session-payment-receipt` email template | Already done; verify the email template copy reads "reçu et facture" — current copy says "Payment received" |
| **24 h + 1 h reminder cron** | n8n `vedioconference.send-reminder` (placeholder) | Real workflow in Phase 3 |
| **Receipt/invoice includes annual tax attestation for at-home SAP sessions only** | n/a | Manual process outside SaaS; requires CoursEnLigne SAP registration |
| **"First slot free" one-time per student** | n/a | A `promotions` table OR a `trial_grants` coupon model |
| **20-min discovery call (free)** | n/a | Separate Calendly event type or admin Calendly organization event type (P1.2) |
| **Pack 10 valid 6 months** | n/a | `session_grants.valid_until` |
| **Suivi mensuel: roll over unused sessions** | n/a | New `subscription_sessions.rollover_count` |
| **At-home exam session eligible for 50 % tax credit** | n/a | Manual invoice, conditional on Urssaf SAP registration |
| **5-level catalog** (Lycée / Prépa / BTS ABM / BioALC / Optique) | Lycée + Prépa only; 3 BTS programs are new | Add the 3 program rows via `/admin/programs` |
| **2 subjects per program** (Maths + Physique-Chimie — treated as one in the editorial) | "Mathématiques" + "Physique" (no separate Chimie) per the seed migration §2.1; the editorial's "Physique-Chimie" wording needs reconciliation (P1.5) | Decide: rename or keep separate subjects? |
| **Pricing contradiction** | Course detail says 35 €/session; chapter pills say 25 €/session | Pick one or differentiate the two (the editorial is internally inconsistent — see §10.B below) |
| **Duration contradiction** | Hero says 45–60 min; course cards say 60 min; chapter intro says 120 min; individual session rows show 60 min (silent) | Pick one canonical duration per session row (60 min) and remove the "45–60 min" copy |

The implementation of these rules in the locked architecture is feasible but **each requires explicit client confirmation** about the canonical value (the editorial is internally inconsistent — see §10.B).

### 10.A Subjects naming — "Physique-Chimie" vs "Physique + Chimie"

The editorial treats Physique-Chimie as a single subject. The v2 schema currently has a `courses` table with `subject` implicit in `title` ("Mathématiques", "Physique") + a `program_id` FK. There is no `subjects` table. The simplest reconciliation is to rename the existing physics course from "Physique" to "Physique-Chimie" via the existing admin course-edit API (Sprint 3.6). This is **a copy change with no schema impact**.

If a future sprint wants to support separate physics and chemistry courses, the schema would need a `subjects` table and a `subject_id` FK on `courses`. **Out of scope** for Sprint 4.

### 10.B Pricing contradiction inside the editorial itself

The editorial is internally inconsistent:

- Home + course cards + pricing column for the unit = **€35**.
- Chapter detail's per-session pricing = **25 €** ("Session 1 · Monotonicity of a sequence — €25", 28 occurrences in §4).

It is impossible for both to be true at the same time; one of the figures is illustrative and the other is contractual. The recommendation: **treat 35 € as the unit-session price (matches the pricing-page card) and treat 25 € as a typo in the chapter pills.** Disambiguation is logged as **P0.1**.

### 10.C Duration contradiction inside the editorial itself

- Hero / "how a session works" copy: "Séances de 45 à 60 minutes"
- Course-card badges: "🕐 60 min" (consistent)
- Chapter intro: "9 chapitres, découpés en sessions de 120 minutes"
- Individual session pills: silent on duration (the implicit per-session duration is 60 min based on the chapter totals: 4 sessions · 480 min total → 120 min/session if the chapter says 480 min total but the pills are 60 min each — contradiction)

The most plausible reading: **a chapter = N × 60 min sessions** (matching the v2 schema's `sessions.duration_min` and the locked "one session = one booking" model). Then:
- "45 to 60 min" hero copy is loose marketing; the canonical duration is **60 min**.
- "120 min" chapter intro is wrong/illustrative; should be removed.
- Chapter "total" should be `sessions.length × 60`, e.g. 4 sessions × 60 min = 240 min (not 480).

Disambiguation is **P0.2**.

### 10.D Statistic claims

The editorial states: "3 400+ corrected exercises", "100% live classes with a teacher", "4 Levels — High school → University" (but the level grid lists 5 levels). These are marketing claims that, **if not backed by real data, expose CoursEnLigne to advertising-law risk in France** (articles L.121-2 et seq. of the French Consumer Code). Recommendation: when the editorial goes live, the seed should set the initial value from the actual database (e.g. `COUNT(courses.chapters.sessions.exercises)`); the value should not be published until the database confirms it. Logged as **P2.1**.

### 10.E Testimonials and named institution logos

The editorial names 3 students (Léa B. · Mehdi R. · Camille V. — Paris · Lyon · Bordeaux) and 6 institutions (Lycée Henri-IV · Lycée Louis-le-Grand · MPSI Fermat · CPGE Hoche · Université Paris-Saclay · INSA Lyon). Both are visible risks:

- Named institutions: would require written permission; if used without permission, exposes the company to trademark / publicity rights claims.
- Named students: require written consent and GDPR data subject rights; minors (Terminale S) require parental consent.

Recommendation: replace the named entities with anonymised labels ("Léa, Terminale — Paris", "Lycée d'élite parisien"), OR obtain written consent before publication. Logged as **P0.3 (consent)** and **P0.4 (legal exposure)**.

---

## 11. Architectural change classification

Every finding above is classified into one of three buckets per the user's standing rule *"if a change is required, surface it and stop; do not implement without approval"*:

- **A. No architecture change** — only copy and components. Safe to plan in Sprint 4 once the client confirms brand + content. Examples: rewriting the marketing copy, adding the Levels index page copy for the 3 BTS programs, adding Tuteurs / Tarifs / À propos pages.
- **B. Additive change** — new schema rows, new tables, new env vars (none are required; recommended additions are surfaced and remain P0-gated). Examples: 8 new Zod schemas for the new packs/products (proposed, not added), 6 new email templates (draft, not wired), parent-report cron (n8n workflow placeholder, not yet wired).
- **C. Locked-architecture change** — would alter a documented contract (Architecture.md, ER_DIAGRAM.mmd, ADRs). **No C-class change is required by the editorial as-it-stands.** The brand change is *not* a C-class change (brand is content, not architecture). Pack + Stage + Suivi mensuel + At-home are all pure additions (B-class). No new SaaS is needed.

**Conclusion of classification:** the editorial can be implemented in full without breaking any locked-architecture decision, **provided the client confirms the 25 open questions below before any code is written.** The most consequential decisions are: (1) the brand change to CoursEnLigne, (2) the product taxonomy (units only / units + pack / units + pack + subscription + at-home / etc.), (3) the at-home delivery channel (which has a legal-SAP dependency).

---

## 12. Sprint 4 impact

### 12.1 What was originally in Sprint 4

Per `docs/review/PHASE2_SPRINT_4_READINESS_REPORT.md`:
- Phase 2 + Sprint 3.x close-out tasks.
- Operator setup (Stripe/Calendly/Zoom/Resend/n8n credentials into Vercel).
- End-to-end smoke tests.
- Re-verify the remote schema is in v2 shape.

### 12.2 What the new client materials add to the backlog

The audit-driven backlog (after Sprint 4 ships) is approximately:

| Backlog bucket | Approx size | New vs carry-over? |
|---|---|---|
| **Rebrand (Intégrale → CoursEnLigne)** across ~80 marketing strings + emails + brand constants | M (2 days) | New |
| **Add 3 BTS program rows** + admin seed | S (½ day) | New |
| **Levels page: per-program detail page for the 3 BTS paths** | S (½ day × 3 = 1.5 days) | New |
| **Tuteurs index + detail pages** | M (2 days) | New |
| **Tarifs page** (4 sub-blocks, SVG flowchart, 3-column table, stages, at-home, tax-credit, payment methods) | L (3–4 days) | New |
| **About page** | S (½ day) | New |
| **Course detail page polish** (sticky CTA, named tutors, chapter pills with per-session price, key concepts) | M (2 days) | New |
| **Schema: 8 new tables** (tutor_qualifications, tutor_applications, session_packages, subscription_sessions, quote_requests, parent_links, parent_reports, at_home_session_details) | L (2 days SQL + 1 day RLS) | New |
| **Stripe products + prices for Pack 10 / Suivi mensuel / Stage / Découverte / Premier créneau offert** | M (operator setup + dev work) | New |
| **Stripe Subscription API integration** (suivi mensuel) | L (3 days) | New |
| **6 new Resend email templates + 13 new n8n workflow placeholders** | M (3 days) | New |
| **Tutor application form + admin review UI** | S (1 day) | New |
| **Parent monthly report scheduling** | M (2 days) | New |
| **At-home delivery channel (delivery_mode column, admin quote UI, manual invoice flow)** | L (4 days) | New |
| **Calendly discovery call Event Type** (separate from the 60-min booking Event Type) | S (½ day) | New — **client decision P1.2** required |
| **First-trial-coupon model + `promotions` table** | S (1 day) | New |
| **Cancellation / no-show policy enforcement** (n8n workflows + grant credit rule) | M (2 days) | New |
| **Content audit**: replace named tutors / institutions / testimonials with verified data, OR obtain consent | operator task (NOT a code task) | New |
| **Bilingual copy**: ~600 strings in EN + FR (per the editorial, mostly already 1:1) | M (depends on how much exists already) | New |

**Backlog estimate (rough):** ~35–45 person-days of frontend work + ~15 days of backend + ~10 days of operator setup. Realistic as a **Phase 3 / Phase 4 multi-sprint plan**, not a single sprint.

### 12.3 What this means for Sprint 4 specifically

**Sprint 4 stays the same:** Phase 2 + Sprint 3 close-out + Operator setup + Remote verification. The new editorial does **not** extend Sprint 4. The next sprint after Sprint 4 (call it "Sprint 5" or "Phase 3 — Sprint A") should be the one that takes the brand change + first marketing pages.

---

## 13. SaaS readiness impact

| SaaS | Today | New requirement | Effort |
|---|---|---|---|
| **Supabase** | Green (EU, RLS, idempotency, 24 tables) | Add ~8 new tables (no env change) | Medium — needs 1 forward-only migration per table family |
| **Stripe** | Green (Checkout pinned to 2024-06-20, webhooks wired) | Add 4 new products + 1 subscription; add `invoice.payment_succeeded` + `customer.subscription.*` handlers | Medium |
| **Calendly** | Green (1 Event Type per tutor) | Add 1 admin Calendly discovery-call Event Type (decision P1.2) | Small |
| **Zoom** | Green (S2S-OAuth, per-tutor host) | Unchanged for online delivery; no at-home session = skip Zoom | None |
| **Resend** | Green (6 templates, mock-gated) | Add 6 new templates | Small |
| **n8n Cloud** | Green (4 env vars, 8 placeholder workflows) | Add 13 new workflow placeholders; the real Phase 3 work loads actual workflow JSONs | Medium — workflow authoring in Phase 3 |
| **Vercel** | Green | No new env vars unless we add `STRIPE_PRICE_*` per product (or a single `STRIPE_PRICE_TABLE_JSON` widening) | Small |
| **GitHub Actions** | Green | Unchanged | None |
| **Sentry** | Not configured (Phase 5) | Not affected | None |

**No new SaaS is required.** No new top-level folder. No new env var is *mandatory* (only `STRIPE_PRICE_TABLE_JSON` may need a re-shaped value, which is a JSON config change, not an env-var add).

The **at-home delivery channel does NOT add a SaaS**: it is operator-mediated.

---

## 14. Change matrix — every proposed change classified

| # | Change | Type | Locks? | Files | Migrations | Env vars | SaaS accounts | Risk | Owner to confirm |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Rebrand Intégrale → CoursEnLigne | A (copy only) | No | brand.ts + i18n + emails + footer + OG + sitemap | 0 | 0 | 0 | Medium (diff-wide rename) | Brand |
| 2 | Add 3 BTS programs (BTS ABM / BioALC / Optique) | A | No | admin create + marketing pages | 0 (only INSERT into `programs`) | 0 | 0 | Low | Curriculum + Brand |
| 3 | Rename "Physique" → "Physique-Chimie" course title | A | No | admin course edit | 0 | 0 | 0 | Low | Brand |
| 4 | 3 new program-detail pages | A | No | `app/[locale]/levels/[slug]/page.tsx` × 3 | 0 | 0 | 0 | Low | N/A |
| 5 | Tuteurs index page | A | No | `app/[locale]/tuteurs/page.tsx` | 0 | 0 | 0 | Low | N/A |
| 6 | Tuteurs detail page | A | No | `app/[locale]/tuteurs/[uuid]/page.tsx` | 0 | 0 | 0 | Low | N/A |
| 7 | Tarifs page | A | No | `app/[locale]/tarifs/page.tsx` | 0 | 0 | 0 | Low–Medium | N/A |
| 8 | About page | A | No | `app/[locale]/a-propos/page.tsx` | 0 | 0 | 0 | Low | Legal copy required (P2.2) |
| 9 | Course detail page polish (sticky CTA, tutor block, chapter pills, key concepts) | A + B (one new column on `tutors` for `headline`) | No | `components/marketing/course-detail.tsx` + child blocks | maybe 1 (additive) | 0 | 0 | Medium | Curriculum |
| 10 | `tutor_qualifications` table (program × grade × tutor) | B | Yes (new table) | `supabase/migrations/<n>_tutor_qualifications.sql` | 1 | 0 | 0 | Medium | Curriculum + Admin |
| 11 | `tutors.headline text` column | B | Yes (new column, nullable) | migration `<n>_tutor_headline.sql` | 1 | 0 | 0 | Low | Curriculum |
| 12 | `session_packages` table (commercial envelopes) | B | Yes (new table) | migration | 1 | 0 | 0 | Medium | Curriculum + Stripe map |
| 13 | `session_grants.package_id` + `valid_until` columns | B | Yes (new cols, nullable) | migration | 1 | 0 | 0 | Medium | Curriculum + n8n workflow |
| 14 | `is_trial` on `session_grants` | B | Yes | migration | 1 (or fold into #13) | 0 | 0 | Low | Curriculum |
| 15 | `session_bookings.delivery_mode` column | B | Yes | migration | 1 | 0 | 0 | Medium | Curriculum + n8n |
| 16 | Pack 10 product in Stripe | B | No | operator setup | 0 | 0 | 0 | Low (operator) | Stripe dashboard |
| 17 | Suivi mensuel subscription product in Stripe + 3 new webhook handlers | B | Yes (new webhook events) | Stripe webhook handler | 0 | 0 | 0 | Medium | Stripe + n8n |
| 18 | Stage 10h + Stage 20h products in Stripe | B | No | operator setup | 0 | 0 | 0 | Low (operator) | Stripe dashboard |
| 19 | At-home quote request (web form + manual invoice) | A + B | Yes (table + admin UI) | new table + admin page | 1 | 0 | 0 | Large | Curriculum + Admin |
| 20 | 6 new Resend email templates (drafts) | A | No | `lib/email/templates/*` | 0 | 0 | 0 | Low | Resend |
| 21 | 13 new n8n workflow placeholders | A | No | `n8n/workflows/*.json` | 0 | 0 | 0 | Low | Phase 3 |
| 22 | 8 new Zod schemas for the new products | A | No | `lib/validations/*` | 0 | 0 | 0 | Low | N/A |
| 23 | Tutor application form + admin review | A + B | Yes (table) | route + page + email | 1 (table) | 0 | 0 | Medium | Admin |
| 24 | Parent monthly report scheduling | B | Yes (2 tables + cron) | tables + n8n cron | 2 | 0 | 0 | Medium | Curriculum + n8n |
| 25 | Calendly discovery-call Event Type | B (operator only) | No | Calendly admin UI | 0 | 0 | 0 | Low | Calendly dashboard (P1.2) |
| 26 | First-trial-coupon model | A or B (depends) | Maybe | new table OR Stripe coupon only | 0 or 1 | 0 | 0 | Low | Curriculum (P1.4) |
| 27 | Cancellation policy enforcement (≤ 1 h) | B | Yes (logic + possible trigger) | n8n workflow + grant column | 1 (or fold into #13) | 0 | 0 | Medium | n8n |
| 28 | Legal pages (CGU / privacy / legal mentions) | A | No | new pages | 0 | 0 | 0 | Low | Legal copy required (P2.2) |
| 29 | Content audit (named tutors / institutions / testimonials consent) | Operator task | No | none | 0 | 0 | 0 | High | Brand + Legal (P0.3, P0.4) |
| 30 | Bilingual copy refresh (~600 strings) | A | No | `messages/en.json` + `messages/fr.json` | 0 | 0 | 0 | Medium | Brand |

**Total migrations needed** (maximum, conservative): **8 forward-only migrations** for the new tables + columns. None alter existing tables' shape beyond adding nullable columns + new tables + RLS policies for the new tables.

**Total env vars needed**: **0 new**. `STRIPE_PRICE_TABLE_JSON` may need a re-shaped value (not added, reshaped). All other env vars remain as today.

**Total SaaS accounts needed**: **0**. All work uses the existing 8 SaaS.

**Total locked-architecture changes**: **0**. The brand change is content. The new products are additive. The new delivery channel (`delivery_mode`) is an additive column, not a redesign.

---

## 15. "Do not implement yet" — explicit hold list

Until the client returns P0–P3 answers and the user explicitly approves, the following are **on hold**, regardless of technical readiness:

1. **No SQL migration files** (`tutor_qualifications`, `tutors.headline`, `session_packages`, `session_grants.package_id`, `session_grants.valid_until`, `session_grants.is_trial`, `session_bookings.delivery_mode`, `tutor_applications`, `subscription_sessions`, `quote_requests`, `parent_links`, `parent_reports`) — **do not write or apply**.
2. **No new SaaS account provisioning** (Stripe Products + Prices, Calendly discovery Event Type, Resend templates beyond drafts) — **do not create or configure**.
3. **No new env vars** (e.g. `STRIPE_PRICE_PACK10`, `STRIPE_PRICE_SUIVI_MENSUEL`, etc.) — **do not add to `.env.example`**.
4. **No rebrand** (brand.ts `name: 'Intégrale'` stays; no "CoursEnLigne" wording in production code) — **do not commit**.
5. **No bootstrap of marketing pages** (`/tuteurs`, `/tarifs`, `/a-propos`, `/devenir-tuteur`) — **do not commit**.
6. **No n8n workflow JSON** for the new products — keep the 8 placeholders; the 13 new ones land in Phase 3 with real implementations.
7. **No Resend template wiring beyond drafts** (the 6 new templates should not be imported by `lib/email/templates/index.ts` until they are copy-approved and translation-tested).
8. **No tutor qualification seeding** (no `(program, grade, tutor)` rows; the admin enters them after the admin tutor UI is built).
9. **No CoursEnLigne Urssaf SAP registration step** (this is outside the SaaS infra; the client owns the legal process).
10. **No publication of named-student testimonials or named-institution logos** (the editorial copy exists; the content audit gates the publish).

---

## 16. Client questions — open issues to resolve before Sprint 5

### P0 — Blockers (must be answered before any implementation)

- **P0.1 — Pricing contradiction (§10.B):** What is the canonical per-session price — 35 € (course-card + pricing-card) or 25 € (chapter pills)? Are the chapter pills meant to represent a per-session **within a chapter of an existing Pack 10** (i.e. each session is amortised, hence cheaper), or are they an alternative product? Without an answer, the schema cannot store a canonical price.
- **P0.2 — Duration contradiction (§10.C):** What is the canonical session duration — 60 min (per-session model, v2 schema-aligned) or 120 min (chapter-pills)? Without an answer, copy + schema duration_min are inconsistent.
- **P0.3 — Named testimonials (§10.E):** Are Léa B. / Mehdi R. / Camille V. real students with written consent, or must they be replaced with anonymous labels before publication? If real, where is the consent stored?
- **P0.4 — Named institution logos (§10.E):** Are the 6 institutions (Henri-IV, Louis-le-Grand, Fermat, Hoche, Paris-Saclay, INSA Lyon) real partnerships with written permission, or must they be replaced with "principales grandes écoles" / anonymous labels before publication?
- **P0.5 — Brand confirmation:** Is the brand really changing from "Intégrale" to "CoursEnLigne"? Or is "CoursEnLigne" a working codename for the editorial team? The rebrand is the single largest diff in the audit and should not start until confirmed.
- **P0.6 — Urssaf SAP registration:** Is CoursEnLigne on track to obtain `Services à la Personne` registration? If no, the at-home exam sessions cannot promise the 50 % tax credit, and the per the editorial's own legal note (§6 of both files) that copy must remain conditional until the registration is obtained.

### P1 — Architectural decisions (must be answered before Sprint 5 plan)

- **P1.1 — Calendly vs contact-form booking:** The HTML reference has NO Calendly embed; the v2 production code uses Calendly. Which is canonical for the new editorial? Is the "Réserver" CTA on the editorial a Calendly inline embed (matching the current architecture) or a contact form (matching the editorial)?
- **P1.2 — Calendly discovery-call Event Type:** Per the user's standing rule (one 60-min Event Type per tutor), a 20-min discovery call would require a separate Calendly Event Type. Should this be per-tutor (same Calendy organisation, separate event type per tutor — 10 new Event Types) or per-organisation (single admin Calendly event type for the whole team)? Recommend the per-organisation model to honour the standing rule.
- **P1.3 — Product taxonomy scope:** Should CoursEnLigne ship all 6 products at launch (Unité + Pack 10 + Suivi mensuel + Stage 10h + Stage 20h + At-home) or a subset (recommended: Unité + Pack 10 at launch; Suivi mensuel in v1.1; Stages in v1.2; At-home once SAP is obtained)? Each product adds a Stripe product, an n8n workflow, and 1–3 email templates.
- **P1.4 — First-trial-coupon model:** Stripe-only coupon (`percent_off: 100, max_redemptions: 1`) or a first-class `trial_grants` table? Stripe-only is faster to ship and **requires no schema change**; recommended.
- **P1.5 — Subject naming:** Rename "Physique" → "Physique-Chimie" (copy-only change) OR introduce a separate `subjects` table and split into two courses (schema change)? Recommended: rename. Defer the `subjects` table to a later sprint if separate physics / chemistry tracks are needed.
- **P1.6 — Pack 10 refund policy:** A student purchases a Pack 10 for 299 € and books 3 sessions, then requests a refund. Should the refund be the unused 70 % (i.e. 7 × €29.90 = €209.30) or a flat pro-rata (€299 × 0.7 = €209.30)? Either way, the refund math must be defined before the Stripe product is created.
- **P1.7 — Tutor change SLA enforcement:** Is the 24 h SLA a **right** of the student (legally enforceable) or a **target** (a marketing promise)? The legal reading requires a staffed admin on-call; the marketing reading allows occasional misses.

### P2 — Legal / communications (must be answered before publishing the new pages)

- **P2.1 — Statistic claims:** "3 400+ corrected exercises", "100% live classes", "4 Levels — High school → University" — what is the verified source? Must not go public unless backed by a DB query result.
- **P2.2 — Legal pages:** CGU / Confidentialité / Mentions légales — does the client have drafted legal copy, or does the launch require a 3rd-party legal review? (The current code does not ship legal pages; the editorial includes them.)
- **P2.3 — Tax-credit copy:** The legal note ("Cette éligibilité reste conditionnée…") must be conditionally-applied until SAP is obtained. Who reviews the copy before launch?

### P3 — Operational (recommended answers, not blockers)

- **P3.1 — Operator setup ordering:** Should Sprint 5 ship brand + Levels + Tuteurs + Tarifs marketing pages with operator setup happening in parallel, or should operator setup (Stripe Dashboard + Calendly + Zoom + Resend + n8n) land first and the marketing pages follow?
- **P3.2 — "Become a tutor" intake:** Email forward to admin, or a structured `tutor_applications` table with an admin review UI? The editorial suggests a web form; a database is recommended for tracking.
- **P3.3 — Parent contact sourcing:** Where does CoursEnLigne obtain the parent email for the monthly report? If the student gives it on signup, no problem. If not, requires a parent email step on signup or a self-serve "Add parent email" in the dashboard.
- **P3.4 — "petits groupes" future:** The editorial mentions "small groups or one-on-one" in the subtitle. Today there is no group-session concept. Confirm this is out-of-scope for the next 6 months; otherwise schedule it as a Sprint N deliverable.

---

## 17. Final recommendation

I have read the three client materials in full, re-verified the current repo state against the actual files (and not against the prior session's memory of the readiness report), classified every finding against the locked architecture, and produced 30 proposed changes classified into "no architecture change" vs "additive" vs "locked-architecture change." My final recommendation is:

**Recommendation A — Adopt the editorial as Phase 3 scope, but sequence it carefully.**

1. **Now (Sprint 4 — unchanged):** close Phase 2 + Sprint 3.x; run operator setup with the existing 1-Event-Type-per-tutor model and the existing 1-product Stripe catalogue.
2. **Sprint 5 (Phase 3 — first sprint):** ship the **rebrand** + the **3 BTS programs** + the new **Levels index detail pages** + **Tuteurs index page** (read-only). This is content-only, no schema, no SaaS changes. Roughly 5–7 days.
3. **Sprint 6:** add the **Tuteurs detail page** + **Tarifs page** + **About page** + **Course detail polish**. Still no new schema if P1.3 ends with "Ship Unité only at launch" or "Ship Unité + Pack 10 at launch".
4. **Sprint 7:** ship the **Pack 10 product** end-to-end (schema + Stripe + n8n + email). Requires ~1 forward-only migration (#12, #13, #14 in §14).
5. **Sprint 8:** ship the **Suivi mensuel subscription** + Stripe Subscription webhook handlers + monthly parent report cron. Requires 2–3 migrations (#13, #24).
6. **Sprint 9 (gated on SAP registration):** ship **At-home exam sessions** + at-home delivery_mode + admin quote UI.

**Recommendation B — Address all P0 questions before any of Sprint 5 commits.**

The rebrand, the at-home channel, and the pricing contradictions are all P0. They must be answered by the client before Sprint 5 begins, or the codebase will accumulate code that needs to be re-done.

**Recommendation C — Do not pre-write any migrations, pages, or template drafts except as truly-isolated documentation**.

This audit does NOT propose pre-writing any of the 8 migrations or the 6 new email templates. The next sprint must start with a plan that respects the locked architecture and the user's standing rule "if a change is required, surface it and stop."

**Recommendation D — Re-verify the locked architecture does NOT need to change.**

The brand, the products, the delivery channel, the i18n, and the Calendly model are all additive or content. No ADR or `docs/architecture/Architecture.md` change is required. The new editorial confirms — rather than contradicts — the locked architecture.

**Recommendation E — Track the at-home delivery as a separate sub-project.**

At-home exam sessions involve:
- New `delivery_mode` column (cheap)
- New `quote_requests` table (cheap)
- Admin quote UI (medium)
- Manual invoice flow outside Stripe (operator process)
- Urssaf SAP registration (legal process, ~3–9 months)
- Annual CESU attestation generation (operator + accounting)

This is outside the SaaS-sprint scope; it should be tracked as a separate project with its own milestones. The marketing page can be shipped with the conditional copy today; the actual booking can launch when SAP is obtained.

**Recommendation F — Treat the 13 new n8n workflows and 8 new email templates as Phase 3 deliverable, not Sprint 5.**

The editorial describes them but the actual workflow JSON + email-template code is best authored in a single Phase-3 sprint that has Phase-3 scope, not the marketing sprint.

**Recommendation G — Re-verify the prior Sprint 4 readiness report.**

The prior readiness report covers Stripe, Calendly, Zoom, Resend, n8n operator setup. None of the new client materials changes those. The readiness report remains accurate. **The two are independent.** The new editorial adds Phase 3 scope; the readiness report covers Phase 2 + Sprint 3.x close-out + Phase 3 trigger.

**Recommendation H — STOP.**

Per the user's standing rule *"After producing the report, STOP and wait for my confirmation"* — this audit produces no implementation, no commit, no migration, no env-var change, no SaaS account provisioning. The next step is the user's explicit approval to begin Sprint 5 (the rebrand sprint), gated by P0 answers.

---

## 18. What this audit does NOT cover (out of scope)

- **Sprint 4 implementation.** Per the standing rule, Sprint 4 stays on its original scope.
- **Spec'd Phase 4 plans** (tutor-side flows, student tutor-picker UX, advanced analytics dashboards). The editorial mentions none of these.
- **n8n workflow JSON authoring.** The 8 placeholder workflows in `n8n/workflows/` remain placeholders; real authoring lands in Phase 3.
- **Stripe Dashboard product / price creation.** This is operator setup; Sprint 4 readiness covers it.
- **Legal review of the editorial.** The editorial's CGU/privacy/legal-mentions pages are mentioned but require legal copy that this audit cannot produce.
- **Urssaf SAP registration.** Operationally owned by the client; not a SaaS change.

---

## 19. Files consulted during this audit (read-only)

- `C:\Vedioconference\CLAUDE.md`
- `C:\Users\Maniv\.claude\projects\C--Vedioconference\memory\MEMORY.md`
- `C:\Vedioconference\supabase\migrations\20260714000004_backfill_curriculum_hierarchy.sql`
- `C:\Vedioconference\supabase\migrations\20260714000006_seed_demo_chapters_sessions.sql`
- `C:\Vedioconference\supabase\migrations\20260719000002_reshape_tutors_v1_to_standalone.sql`
- `C:\Vedioconference\apps\web\app\api\webhooks\n8n\route.ts`
- `C:\Vedioconference\apps\web\app\api\webhooks\stripe\route.ts`
- `C:\Vedioconference\apps\web\lib\env.ts`
- `C:\Vedioconference\apps\web\lib\stripe\client.ts`
- `C:\Vedioconference\apps\web\lib\email\send.ts`
- `C:\Vedioconference\apps\web\lib\validations\admin-catalog.ts`
- `C:\Vedioconference\apps\web\lib\constants\brand.ts`
- `C:\Vedioconference\apps\web\services\curriculum\programs.ts`
- `C:\Vedioconference\apps\web\services\curriculum\sessions.ts`
- `C:\Vedioconference\docs\review\PHASE2_SPRINT_4_READINESS_REPORT.md` (referenced, not re-exported)
- `C:\Vedioconference\docs\review\SPRINT4_OPERATOR_SETUP_GUIDE.md` (referenced, not re-exported)
- `C:\Users\Maniv\Downloads\CoursEnLigne-Editorial-Structure_160826-EN.docx` → extracted to `…\_docx_work\en.txt` and read in full
- `C:\Users\Maniv\Downloads\CoursEnLigne-Structure-editoriale 160826-du-site-3.docx` → extracted to `…\_docx_work\fr.txt` and read in full
- `C:\Users\Maniv\Downloads\coursenligne 160826.html` → read in full (all 2 421 lines)

## 20. What this audit produced

- This single file: `C:\Vedioconference\docs\review\CLIENT_DOCUMENTATION_AUDIT.md` (analysis only — documentation deliverable, not application code, not a migration, not an env-var change).
- Two intermediate text files in `C:\Users\Maniv\Downloads\_docx_work\en.txt` and `…\fr.txt` (extracted `.docx` text). These are outside the project; they are not committed to the repo. They are the literal content of the client-supplied documents, written to a working directory.

## 21. Definition of "audit complete"

Per the user's task statement:

> *"The objective of this task is: Understand the new client requirements completely → compare them against the existing project → identify architectural/database/frontend/SaaS impact → identify contradictions → identify required client decisions → recommend the safest next steps."*

This audit satisfies that objective. The report classifies every finding against the locked architecture, identifies contradictions (P0.1, P0.2), enumerates required client decisions (P0–P3), and recommends 8 sequenced next steps (Recommendation A–H). The audit **does not** start Sprint 5, does not modify any code, does not create any migrations, does not touch any env vars, does not commit anything, does not provision any SaaS accounts.

Per the user's standing rule: **stop and wait for confirmation.**

---

*Audit finished 2026-08-18. Owner: project lead. Awaiting explicit approval before any Sprint 5 implementation, AND before any of the 30 proposed changes in §14 is actioned. The P0 questions in §16 must be answered before the first brand rebrand commit.*
