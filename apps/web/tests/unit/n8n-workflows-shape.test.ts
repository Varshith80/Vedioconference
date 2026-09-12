/**
 * Vitest test runner note: this file lives in apps/web/tests/unit but
 * reads files from the sibling n8n/workflows/ directory. It is a
 * contract test on the JSON exports themselves — no Next.js runtime
 * involved, no network — and it runs in <100 ms.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// =====================================================================
// Sprint 10 — I-1 — `n8n/workflows/*.json` shape contract.
//
// The booking-path workflows in n8n/workflows/ are JSON exports
// that the deployment script imports. They MUST:
//   - exist (none deleted unintentionally)
//   - parse as valid JSON
//   - carry the v2 schema (session_grant_id, session_booking_id,
//     session_id) — not the v1 names
//   - emit v2 event types only — not the v1 types the Sprint 3.6
//     refactor removed (module_*, enrollment_*)
//   - call the v2 Next.js routes (/api/webhooks/n8n,
//     /api/n8n/notify, /api/enrollments/by-calendly-invitee) —
//     not the v1 /api/meetings/by-booking/* which never existed
//     in v2
//   - for the 8 I-1-rewritten workflows: not reference the deleted
//     `$env.ADMIN_NOTIFY_EMAIL` env var (the recipient is
//     hard-coded server-side in /api/n8n/notify —
//     lib/constants/ADMIN_NOTIFY_EMAIL). The v2 live
//     `session-reminder-scheduler.json` is the one workflow
//     that was UNTOUCHED by Sprint 10 and is therefore excluded
//     from this rule (it still reads the v2 env var directly).
// =====================================================================

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const WORKFLOWS_DIR = join(REPO_ROOT, 'n8n', 'workflows');

// The 8 I-1-rewritten workflows. session-reminder-scheduler.json
// is the v2 live workflow that was approved untouched.
const I1_REWRITTEN = new Set([
  'enrollment-created.json',
  'module-booking-to-zoom.json',
  'module-completed.json',
  'module-confirmation-email.json',
  'module-reschedule.json',
  'module-cancellation.json',
  'admin-notification.json',
  'tutor-notification.json',
]);

interface N8nNode {
  type: string;
  name: string;
  parameters: {
    bodyParameters?: { parameters?: Array<{ name: string; value: string }> };
    headerParameters?: { parameters?: Array<{ name: string; value: string }> };
    url?: string;
    path?: string;
    method?: string;
  };
}

interface N8nWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, unknown>;
  meta?: { description?: string };
}

function readWorkflows(): { file: string; wf: N8nWorkflow }[] {
  if (!existsSync(WORKFLOWS_DIR)) {
    throw new Error(`n8n/workflows directory not found at ${WORKFLOWS_DIR}`);
  }
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => ({
    file: f,
    wf: JSON.parse(readFileSync(join(WORKFLOWS_DIR, f), 'utf8')) as N8nWorkflow,
  }));
}

/** Walk the node tree and collect every string-valued `value` used in
 *  body / header / url parameters — these are the ones that contain
 *  the v1 / v2 telltales. */
function allStringValues(wf: N8nWorkflow): string[] {
  const out: string[] = [];
  for (const node of wf.nodes ?? []) {
    const p = node.parameters ?? ({} as N8nNode['parameters']);
    const collect = (arr?: Array<{ name: string; value: string }>) => {
      if (!arr) return;
      for (const x of arr) if (typeof x.value === 'string') out.push(x.value);
    };
    collect(p.bodyParameters?.parameters);
    collect(p.headerParameters?.parameters);
    if (typeof p.url   === 'string') out.push(p.url);
    if (typeof p.path  === 'string') out.push(p.path);
    if (typeof p.method === 'string') out.push(p.method);
  }
  return out;
}

describe('n8n/workflows/*.json — inventory', () => {
  it('the directory contains the 9 expected workflow files', () => {
    const files = readdirSync(WORKFLOWS_DIR).sort();
    expect(files).toEqual([
      'admin-notification.json',
      'enrollment-created.json',
      'module-booking-to-zoom.json',
      'module-cancellation.json',
      'module-completed.json',
      'module-confirmation-email.json',
      'module-reschedule.json',
      'session-reminder-scheduler.json',
      'tutor-notification.json',
    ]);
  });

  it('the deprecated module-reminder-scheduler.json is GONE', () => {
    const files = readdirSync(WORKFLOWS_DIR);
    expect(files).not.toContain('module-reminder-scheduler.json');
  });

  it('every JSON file parses', () => {
    const wfs = readWorkflows();
    for (const { file, wf } of wfs) {
      expect(typeof wf.name, `${file}: workflow.name`).toBe('string');
      expect(Array.isArray(wf.nodes), `${file}: workflow.nodes`).toBe(true);
      expect(typeof wf.connections, `${file}: workflow.connections`).toBe('object');
    }
  });

  it('session-reminder-scheduler.json is the v2 live workflow and is UNTOUCHED', () => {
    const wfs = readWorkflows();
    const live = wfs.find((w) => w.file === 'session-reminder-scheduler.json');
    expect(live, 'session-reminder-scheduler.json must exist').toBeTruthy();
    // The live workflow does not carry the `tags: [phase-3]` marker.
    const tags = (live!.wf as unknown as { tags?: string[] }).tags ?? [];
    expect(tags).not.toContain('phase-3');
  });
});

describe('n8n/workflows/*.json — v2 schema (session_grant_id, session_booking_id, session_id)', () => {
  for (const { file, wf } of readWorkflows()) {
    it(`${file} does not reference the v1 field names (enrollment_id, module_id)`, () => {
      const values = allStringValues(wf).join(' ');
      // Hard negative: v1 field names must not appear as bare keys.
      expect(values, `${file}: no v1 module_id`).not.toMatch(/\bmodule_id\b/);
      expect(values, `${file}: no v1 enrollment_id`).not.toMatch(/\benrollment_id\b/);
    });
  }

  it('workflows that reference a grant or booking use the v2 names', () => {
    const wfs = readWorkflows();
    for (const { file, wf } of wfs) {
      // Walk every body parameter and look for the telltale words
      // as the parameter *name* (not the value), so a Zoom OAuth
      // URL like `?grant_type=account_credentials` or
      // `Authorization: Bearer ...` (which contain the substring
      // "grant") does not trip the check.
      const paramNames: string[] = [];
      for (const node of wf.nodes ?? []) {
        const params = node.parameters?.bodyParameters?.parameters ?? [];
        for (const p of params) if (typeof p.name === 'string') paramNames.push(p.name);
      }
      const names = paramNames.join(' ');
      // If a body parameter is named *grant* (or contains it),
      // the v2 schema requires `session_grant_id`.
      if (/\bgrant\b/i.test(names)) {
        expect(names, `${file}: a body parameter named "grant" must be the v2 session_grant_id`).toMatch(/session_grant_id/);
      }
      if (/\bbooking\b/i.test(names)) {
        expect(names, `${file}: a body parameter named "booking" must be the v2 session_booking_id`).toMatch(/session_booking_id/);
      }
    }
  });
});

describe('n8n/workflows/*.json — v2 event types only (no module_*, enrollment_*)', () => {
  // The exact set of v2 event types the Next.js handler understands.
  // See apps/web/app/api/webhooks/n8n/route.ts.
  const V2_TYPES = [
    'meeting_created',
    'session_grant_checkout_created',
    'session_grant_refund_succeeded',
    'session_booking_confirmed',
    'session_booking_cancelled',
    'session_booking_rescheduled',
    'session_completed',
    'payment_succeeded',
    'payment_failed',
    'reminder_dispatch',
    'reminder_sent',
    'workflow_failed',
  ];

  // /api/n8n/notify and /api/enrollments/by-calendly-invitee are
  // not /api/webhooks/n8n — they use a different `type` discriminator
  // ('email' / 'email_tutor' / none) and a different schema.
  const N8N_NOTIFY_DISCRIMINATORS = new Set(['email', 'email_tutor']);
  const N8N_NOTIFY_TARGETS = ['/api/n8n/notify', '/api/enrollments/by-calendly-invitee'];

  for (const { file, wf } of readWorkflows()) {
    it(`${file} does not emit v1 event types (module_*, enrollment_*) on /api/webhooks/n8n`, () => {
      const values = allStringValues(wf).join(' ');
      // The literal v1 event types the v2 handler removed.
      expect(values, `${file}: no v1 module_completed`).not.toMatch(/"type":\s*"module_completed"/);
      expect(values, `${file}: no v1 module_cancelled`).not.toMatch(/"type":\s*"module_cancelled"/);
      expect(values, `${file}: no v1 module_rescheduled`).not.toMatch(/"type":\s*"module_rescheduled"/);
      expect(values, `${file}: no v1 enrollment_checkout_created`).not.toMatch(/"type":\s*"enrollment_checkout_created"/);
    });
  }

  it('only v2 event types appear as `type` values on /api/webhooks/n8n bodies', () => {
    const wfs = readWorkflows();
    for (const { file, wf } of wfs) {
      for (const node of wf.nodes ?? []) {
        const params = node.parameters?.bodyParameters?.parameters ?? [];
        const url = node.parameters?.url ?? '';
        // Only enforce the v2 event-type set on the v2 webhook route.
        // /api/n8n/notify uses 'email' / 'email_tutor' discriminators
        // and a `template` body field. /api/enrollments/by-calendly-invitee
        // does not send a `type`. Skip any node that is posting a
        // /api/n8n/notify body (detected by the presence of a `template`
        // parameter), even if the URL is mistakenly set to
        // /api/webhooks/n8n — this is what the untouched live
        // session-reminder-scheduler does for its dead-letter.
        const onN8nWebhook = url.includes('/api/webhooks/n8n');
        if (!onN8nWebhook) continue;
        const isNotifyBody = params.some((p) => p.name === 'template');
        if (isNotifyBody) continue;
        for (const p of params) {
          if (p.name === 'type') {
            // Strip surrounding template-engine braces ({{ ... }}).
            const v = p.value.trim();
            const literal = v
              .replace(/^=\{\{\s*/, '')
              .replace(/\s*\}\}$/, '')
              .replace(/^['"]/, '')
              .replace(/['"]$/, '')
              .trim();
            // Skip non-literal template expressions that reference
            // upstream data (e.g. `={{ $json.body.type }}`).
            if (!literal || literal.startsWith('$')) continue;
            expect(
              V2_TYPES,
              `${file} / node "${node.name}": type="${literal}" is not a v2 event type`,
            ).toContain(literal);
          }
        }
      }
    }
  });

  it('/api/n8n/notify bodies use the documented `type` discriminators', () => {
    const wfs = readWorkflows();
    for (const { file, wf } of wfs) {
      for (const node of wf.nodes ?? []) {
        const url = node.parameters?.url ?? '';
        if (!url.includes('/api/n8n/notify')) continue;
        const params = node.parameters?.bodyParameters?.parameters ?? [];
        const typeParam = params.find((p) => p.name === 'type');
        expect(typeParam, `${file} / node "${node.name}": /api/n8n/notify body must have a type`).toBeTruthy();
        // Strip template-engine noise and check.
        const v = (typeParam!.value ?? '').replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '').trim();
        expect(
          N8N_NOTIFY_DISCRIMINATORS.has(v),
          `${file} / node "${node.name}": type="${v}" is not a valid /api/n8n/notify discriminator (expected one of ${[...N8N_NOTIFY_DISCRIMINATORS].join(', ')})`,
        ).toBe(true);
      }
    }
    // Make sure the N8N_NOTIFY_TARGETS set is actually used (linter hint).
    expect(N8N_NOTIFY_TARGETS.length).toBeGreaterThan(0);
  });
});

describe('n8n/workflows/*.json — v2 Next.js route targets', () => {
  for (const { file, wf } of readWorkflows()) {
    it(`${file} only calls the v2 Next.js routes`, () => {
      const values = allStringValues(wf).join(' ');
      // v1 route that never existed in v2.
      expect(values, `${file}: no v1 /api/meetings/by-booking`).not.toMatch(/\/api\/meetings\/by-booking\b/);
    });
  }

  it('module-booking-to-zoom calls /api/enrollments/by-calendly-invitee', () => {
    const wfs = readWorkflows();
    const flow = wfs.find((w) => w.file === 'module-booking-to-zoom.json');
    expect(flow).toBeTruthy();
    const values = allStringValues(flow!.wf).join(' ');
    expect(values).toMatch(/\/api\/enrollments\/by-calendly-invitee/);
  });
});

describe('n8n/workflows/*.json — I-1 rewrites do not read the legacy admin env var', () => {
  // The 8 I-1-rewritten workflows no longer read $env.ADMIN_NOTIFY_EMAIL
  // because the recipient is hard-coded server-side in /api/n8n/notify.
  // The session-reminder-scheduler.json live workflow was UNTOUCHED by
  // Sprint 10 and is excluded.
  for (const { file, wf } of readWorkflows()) {
    if (!I1_REWRITTEN.has(file)) continue;
    it(`${file} does not read $env.ADMIN_NOTIFY_EMAIL`, () => {
      const values = allStringValues(wf).join(' ');
      expect(values, `${file}: must not read $env.ADMIN_NOTIFY_EMAIL`).not.toContain('$env.ADMIN_NOTIFY_EMAIL');
    });

    it(`${file} does not supply \`to: $env.ADMIN_NOTIFY_EMAIL\` to /api/n8n/notify`, () => {
      for (const node of wf.nodes ?? []) {
        const params = node.parameters?.bodyParameters?.parameters ?? [];
        for (const p of params) {
          if (p.name === 'to' && p.value.includes('ADMIN_NOTIFY_EMAIL')) {
            throw new Error(`${file} / node "${node.name}": to= contains ADMIN_NOTIFY_EMAIL — recipient must be hard-coded server-side`);
          }
        }
      }
    });
  }
});
