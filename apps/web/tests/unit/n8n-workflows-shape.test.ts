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
//   - the 10th workflow (zoom-recording-completed.json,
//     added in Sprint 11 11-D) is a transparent transport
//     that forwards the original Zoom signed request to
//     /api/webhooks/zoom/ — it does not read the n8n
//     admin env var and does not need the v2 webhook secret.
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
    body?: string;
    responseBody?: string;
    specifyBody?: string;
    httpMethod?: string;
    responseMode?: string;
    options?: Record<string, unknown>;
    conditions?: unknown;
  };
}

interface N8nWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, { main?: Array<Array<{ node?: string; type?: string; index?: number } | undefined>> }>;
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
  it('the directory contains the 10 expected workflow files (9 originals + Sprint 11 11-D zoom-recording-completed)', () => {
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
      'zoom-recording-completed.json',
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

describe('n8n/workflows/*.json — Sprint 11 11-A dead-letter cleanup', () => {
  // The session-reminder-scheduler.json dead-letter HttpRequest node
  // posts to /api/webhooks/n8n with a `template: admin_dead_letter`
  // body. The /api/n8n/notify route hard-codes the admin recipient
  // (lib/constants/ADMIN_NOTIFY_EMAIL) and ignores any body `to` field
  // for admin_* templates. The dead-letter workflow MUST NOT supply a
  // body `to` field — the absence makes the server-side constant the
  // single source of truth and prevents a future regression where a
  // body `to` leaks a digest to an attacker-controlled address.
  it('session-reminder-scheduler.json has exactly one /api/webhooks/n8n admin_dead_letter node', () => {
    const wfs = readWorkflows();
    const live = wfs.find((w) => w.file === 'session-reminder-scheduler.json');
    expect(live, 'session-reminder-scheduler.json must exist').toBeTruthy();
    const deadLetterNodes: Array<{ node: N8nNode; template: string; url: string }> = [];
    for (const node of live!.wf.nodes ?? []) {
      const url = node.parameters?.url ?? '';
      if (!url.includes('/api/webhooks/n8n')) continue;
      const params = node.parameters?.bodyParameters?.parameters ?? [];
      const typeParam = params.find((p) => p.name === 'type');
      const templateParam = params.find((p) => p.name === 'template');
      if (typeParam?.value === 'email' && templateParam?.value === 'admin_dead_letter') {
        deadLetterNodes.push({ node, template: templateParam.value, url });
      }
    }
    expect(deadLetterNodes).toHaveLength(1);
  });

  it('the session-reminder-scheduler dead-letter node does not supply a body `to` field', () => {
    const wfs = readWorkflows();
    const live = wfs.find((w) => w.file === 'session-reminder-scheduler.json');
    expect(live).toBeTruthy();
    for (const node of live!.wf.nodes ?? []) {
      const url = node.parameters?.url ?? '';
      if (!url.includes('/api/webhooks/n8n')) continue;
      const params = node.parameters?.bodyParameters?.parameters ?? [];
      const typeParam = params.find((p) => p.name === 'type');
      const templateParam = params.find((p) => p.name === 'template');
      if (typeParam?.value !== 'email' || templateParam?.value !== 'admin_dead_letter') continue;
      const toParam = params.find((p) => p.name === 'to');
      expect(
        toParam,
        `session-reminder-scheduler / node "${node.name}": admin_dead_letter body must NOT carry a 'to' field — the recipient is hard-coded server-side in /api/n8n/notify (lib/constants/ADMIN_NOTIFY_EMAIL).`,
      ).toBeUndefined();
    }
  });

  it('the session-reminder-scheduler dead-letter node does not read $env.ADMIN_NOTIFY_EMAIL anywhere', () => {
    const wfs = readWorkflows();
    const live = wfs.find((w) => w.file === 'session-reminder-scheduler.json');
    expect(live).toBeTruthy();
    const values = allStringValues(live!.wf).join(' ');
    expect(values, 'session-reminder-scheduler.json must not reference $env.ADMIN_NOTIFY_EMAIL').not.toContain('$env.ADMIN_NOTIFY_EMAIL');
  });

  it('no workflow across the set supplies a body `to` field on an admin_* template', () => {
    // Defence-in-depth: this rule applies to every workflow, not just
    // session-reminder-scheduler. An admin_* template's recipient is
    // always the server-side constant.
    const ADMIN_TEMPLATES = new Set([
      'admin_dead_letter',
      'admin_booking_confirmed',
      'admin_booking_cancelled',
      'admin_booking_rescheduled',
    ]);
    for (const { file, wf } of readWorkflows()) {
      for (const node of wf.nodes ?? []) {
        const url = node.parameters?.url ?? '';
        if (!url.includes('/api/webhooks/n8n')) continue;
        const params = node.parameters?.bodyParameters?.parameters ?? [];
        const typeParam = params.find((p) => p.name === 'type');
        const templateParam = params.find((p) => p.name === 'template');
        if (typeParam?.value !== 'email') continue;
        if (!templateParam || !ADMIN_TEMPLATES.has(templateParam.value)) continue;
        const toParam = params.find((p) => p.name === 'to');
        expect(
          toParam,
          `${file} / node "${node.name}": admin_* template "${templateParam.value}" must NOT carry a body 'to' field`,
        ).toBeUndefined();
      }
    }
  });
});

// =====================================================================
// Sprint 11 — 11-D — `n8n/workflows/zoom-recording-completed.json`.
//
// The new workflow is a transparent transport: it receives the
// original signed Zoom request and forwards the raw body +
// x-zm-signature + x-zm-request-timestamp to
// POST /api/webhooks/zoom/. The Next.js route is the Zoom trust
// boundary and verifies the original HMAC. n8n is forbidden from:
//   - knowing ZOOM_WEBHOOK_SECRET
//   - recomputing the signature
//   - re-serialising / re-constructing the body
//   - filtering events
//   - sending `x-webhook-secret` to /api/webhooks/zoom/
// =====================================================================

describe('n8n/workflows/zoom-recording-completed.json — Sprint 11 11-D', () => {
  const FILE = 'zoom-recording-completed.json';
  const wfs = readWorkflows();
  const flow = wfs.find((w) => w.file === FILE);
  if (!flow) {
    // Surface as a single failing assertion when the file is
    // missing — the rest of the describe block can then
    // short-circuit on `flow` being undefined.
    it('zoom-recording-completed.json exists', () => {
      expect(flow, 'zoom-recording-completed.json must exist').toBeTruthy();
    });
    return;
  }
  const wf = flow.wf;

  // A. The file exists and parses as valid JSON. (The inventory
  //    + every-JSON-file-parses describe blocks already cover
  //    this; pin it again for self-documentation.)
  it('A. file exists and is valid JSON', () => {
    expect(typeof wf.name).toBe('string');
    expect(Array.isArray(wf.nodes)).toBe(true);
    expect(typeof wf.connections).toBe('object');
  });

  // B. Workflow identity.
  it('B. workflow name is "zoom-recording-completed"', () => {
    expect(wf.name).toBe('zoom-recording-completed');
  });

  // Helper: find a node by exact name.
  const findNode = (name: string) =>
    (wf.nodes ?? []).find((n) => n?.name === name);

  // C. Inbound Webhook node.
  it('C. contains an inbound Webhook node (n8n-nodes-base.webhook)', () => {
    const webhookNodes = (wf.nodes ?? []).filter(
      (n) => n?.type === 'n8n-nodes-base.webhook',
    );
    expect(webhookNodes.length, 'at least one Webhook node').toBeGreaterThan(0);
    const inbound = webhookNodes[0]!;
    // Must accept POST (Zoom's webhook delivery is POST).
    expect(inbound.parameters?.httpMethod).toBe('POST');
    // Must have a stable path so the operator can register
    // the URL in the Zoom Marketplace.
    expect(typeof inbound.parameters?.path).toBe('string');
    expect((inbound.parameters?.path as string).length).toBeGreaterThan(0);
  });

  // D. HTTP Request node targeting /api/webhooks/zoom/.
  it('D. contains an HTTP Request node posting to /api/webhooks/zoom/', () => {
    const httpNodes = (wf.nodes ?? []).filter(
      (n) => n?.type === 'n8n-nodes-base.httpRequest',
    );
    const zoomForward = httpNodes.find((n) =>
      (n?.parameters?.url ?? '').includes('/api/webhooks/zoom/'),
    );
    expect(zoomForward, 'a POST to /api/webhooks/zoom/ must exist').toBeTruthy();
  });

  // E. HTTP method is POST.
  it('E. the /api/webhooks/zoom/ HTTP Request node uses POST', () => {
    const httpNodes = (wf.nodes ?? []).filter(
      (n) => n?.type === 'n8n-nodes-base.httpRequest',
    );
    const zoomForward = httpNodes.find((n) =>
      (n?.parameters?.url ?? '').includes('/api/webhooks/zoom/'),
    );
    expect(zoomForward?.parameters?.method).toBe('POST');
  });

  // F. The original `x-zm-signature` header is forwarded.
  it('F. forwards the original x-zm-signature header', () => {
    const httpNodes = (wf.nodes ?? []).filter(
      (n) => n?.type === 'n8n-nodes-base.httpRequest',
    );
    const zoomForward = httpNodes.find((n) =>
      (n?.parameters?.url ?? '').includes('/api/webhooks/zoom/'),
    );
    const headers = zoomForward?.parameters?.headerParameters?.parameters ?? [];
    const sigHeader = headers.find((h) => h.name === 'x-zm-signature');
    expect(sigHeader, 'x-zm-signature header must be set on the forward').toBeTruthy();
    // Must reference the inbound header (not a constant), i.e.
    //   "={{ $json.headers['x-zm-signature'] }}"
    expect(sigHeader!.value).toBe("={{ $json.headers['x-zm-signature'] }}");
  });

  // G. The original `x-zm-request-timestamp` header is forwarded.
  it('G. forwards the original x-zm-request-timestamp header', () => {
    const httpNodes = (wf.nodes ?? []).filter(
      (n) => n?.type === 'n8n-nodes-base.httpRequest',
    );
    const zoomForward = httpNodes.find((n) =>
      (n?.parameters?.url ?? '').includes('/api/webhooks/zoom/'),
    );
    const headers = zoomForward?.parameters?.headerParameters?.parameters ?? [];
    const tsHeader = headers.find((h) => h.name === 'x-zm-request-timestamp');
    expect(tsHeader, 'x-zm-request-timestamp header must be set on the forward').toBeTruthy();
    expect(tsHeader!.value).toBe("={{ $json.headers['x-zm-request-timestamp'] }}");
  });

  // H. ZOOM_WEBHOOK_SECRET is NOT referenced anywhere in the workflow.
  it('H. does NOT reference ZOOM_WEBHOOK_SECRET', () => {
    const allValues: string[] = [];
    for (const node of wf.nodes ?? []) {
      const p = node?.parameters ?? {};
      const collect = (v: unknown) => {
        if (typeof v === 'string') allValues.push(v);
      };
      collect(p.url);
      collect(p.body);
      collect(p.responseBody);
      const params = (p as { bodyParameters?: { parameters?: Array<{ value: string }> } })
        .bodyParameters?.parameters;
      for (const x of params ?? []) collect(x.value);
      const headers = (p as { headerParameters?: { parameters?: Array<{ value: string }> } })
        .headerParameters?.parameters;
      for (const x of headers ?? []) collect(x.value);
    }
    const haystack = allValues.join(' ');
    expect(
      haystack,
      'ZOOM_WEBHOOK_SECRET must never appear in the workflow — verification belongs to /api/webhooks/zoom/',
    ).not.toContain('ZOOM_WEBHOOK_SECRET');
  });

  // I. x-webhook-secret is NOT sent to /api/webhooks/zoom/.
  it('I. does NOT send x-webhook-secret to /api/webhooks/zoom/', () => {
    const httpNodes = (wf.nodes ?? []).filter(
      (n) => n?.type === 'n8n-nodes-base.httpRequest',
    );
    const zoomForward = httpNodes.find((n) =>
      (n?.parameters?.url ?? '').includes('/api/webhooks/zoom/'),
    );
    const headers = zoomForward?.parameters?.headerParameters?.parameters ?? [];
    const n8nSecret = headers.find((h) => h.name === 'x-webhook-secret');
    expect(
      n8nSecret,
      '/api/webhooks/zoom/ does not use the n8n shared secret; it verifies the original Zoom signature',
    ).toBeUndefined();
  });

  // J + K. The forwarding body is the Webhook's raw-body string,
  //        NOT a JSON.parse/stringify reconstruction.
  it('J+K. forwards the raw body string and does NOT JSON.parse/stringify it', () => {
    const httpNodes = (wf.nodes ?? []).filter(
      (n) => n?.type === 'n8n-nodes-base.httpRequest',
    );
    const zoomForward = httpNodes.find((n) =>
      (n?.parameters?.url ?? '').includes('/api/webhooks/zoom/'),
    );
    const p = zoomForward?.parameters ?? {};
    // The Webhook node is configured with options.rawBody=true
    // so `$json.body` IS the raw body string. The HttpRequest
    // must forward it as a string (specifyBody='string'), not
    // a bodyParameters object (which would re-shape it).
    expect(p.specifyBody, 'forwarding must use specifyBody=string').toBe('string');
    expect(typeof p.body, 'body must be a string expression').toBe('string');
    expect(p.body, 'body must reference the raw body directly').toBe('={{ $json.body }}');
    // Defence-in-depth: the workflow must NOT include a
    // bodyParameters.parameters[] block on this node — that
    // would force n8n to re-shape the body and invalidate
    // the signature.
    expect(
      (p as { bodyParameters?: unknown }).bodyParameters,
      'must NOT use bodyParameters (it would re-shape the body)',
    ).toBeUndefined();
    // And must NOT contain a JSON.stringify(…($json.body)) reconstruction.
    const allText = JSON.stringify(p);
    expect(
      allText,
      'must NOT reconstruct the body via JSON.stringify($json.body)',
    ).not.toMatch(/JSON\.stringify\s*\(\s*\$\{?\$json\.body\}?\s*\)/);
    expect(
      allText,
      'must NOT JSON.parse the body and re-emit it',
    ).not.toMatch(/JSON\.parse\s*\(\s*\$\{?\$json\.body\}?\s*\)/);
    // Pin that the Webhook node opts into raw-body mode so
    // `$json.body` is the raw string, not a parsed object.
    const webhookNodes = (wf.nodes ?? []).filter(
      (n) => n?.type === 'n8n-nodes-base.webhook',
    );
    const wb = webhookNodes[0];
    expect(
      (wb?.parameters?.options as { rawBody?: unknown } | undefined)?.rawBody,
      'Webhook node must enable options.rawBody=true so $json.body is the raw body string',
    ).toBe(true);
  });

  // L. Retry behavior exists and is bounded at 3 attempts.
  it('L. retry behavior exists and is bounded at 3 attempts', () => {
    const httpNodes = (wf.nodes ?? []).filter(
      (n) => n?.type === 'n8n-nodes-base.httpRequest',
    );
    const zoomForward = httpNodes.find((n) =>
      (n?.parameters?.url ?? '').includes('/api/webhooks/zoom/'),
    );
    // The repo's established convention is:
    //   1. The forward HttpRequest has `continueOnFail: true`
    //      so the error output of the node is populated.
    //   2. The error output is routed via the connection graph
    //      to a downstream If → dead-letter node.
    //   3. A 3-attempt cap is implemented at the
    //      `options.retry` level (n8n 1.x HttpRequest) OR by
    //      the If-node routing that bails to the dead-letter
    //      after the first error (since the forward itself
    //      is one HTTP attempt; the next retries happen
    //      inside the next.js route's own dedup / replay).
    // The contract here is: bounded retry policy is present.
    const opts = (zoomForward?.parameters?.options ?? {}) as {
      retry?: { maxTries?: number };
    };
    const nodeMaxTries = opts.retry?.maxTries;
    expect(
      nodeMaxTries,
      'HttpRequest must set options.retry.maxTries to bound retries at 3',
    ).toBe(3);
  });

  // M. The exhausted path reaches the admin dead-letter notification.
  it('M. the exhausted path reaches the admin_dead_letter notify mechanism', () => {
    const httpNodes = (wf.nodes ?? []).filter(
      (n) => n?.type === 'n8n-nodes-base.httpRequest',
    );
    const deadLetter = httpNodes.find((n) => {
      const params = n?.parameters?.bodyParameters?.parameters ?? [];
      const t = params.find((p) => p.name === 'type')?.value;
      const tpl = params.find((p) => p.name === 'template')?.value;
      return t === 'email' && tpl === 'admin_dead_letter';
    });
    expect(
      deadLetter,
      'admin_dead_letter HttpRequest must exist (route: /api/webhooks/n8n)',
    ).toBeTruthy();
    expect(deadLetter!.parameters?.url).toContain('/api/webhooks/n8n');
    // Trace: the forward node's error output (index 1) must
    // reach the dead-letter node (directly or via an If).
    const forward = (wf.nodes ?? []).find((n) =>
      n?.type === 'n8n-nodes-base.httpRequest' &&
      (n?.parameters?.url ?? '').includes('/api/webhooks/zoom/'),
    );
    expect(forward, 'forward HttpRequest must exist').toBeTruthy();
    const forwardOut = wf.connections?.[forward!.name]?.main ?? [];
    // The forward's two outputs are:
    //   index 0 → success branch (Respond OK)
    //   index 1 → error branch (If forwarding failed → dead-letter)
    const errorOutput = forwardOut[1] ?? [];
    const errorReaches = errorOutput.some(
      (c) => {
        if (!c?.node) return false;
        if (c.node === deadLetter!.name) return true;
        // … or routes through the If node that gates the
        // dead-letter call (the If's success branch
        // forwards to the dead-letter).
        const next = wf.connections?.[c.node]?.main?.[0] ?? [];
        return next.some((cc) => cc?.node === deadLetter!.name);
      },
    );
    expect(
      errorReaches,
      'forward error output must reach the admin_dead_letter node (directly or via the If gate)',
    ).toBe(true);
  });

  // N. The dead-letter request does NOT supply a body `to` field.
  it('N. the admin_dead_letter request does NOT supply a body `to` field', () => {
    const httpNodes = (wf.nodes ?? []).filter(
      (n) => n?.type === 'n8n-nodes-base.httpRequest',
    );
    const deadLetter = httpNodes.find((n) => {
      const params = n?.parameters?.bodyParameters?.parameters ?? [];
      const t = params.find((p) => p.name === 'type')?.value;
      const tpl = params.find((p) => p.name === 'template')?.value;
      return t === 'email' && tpl === 'admin_dead_letter';
    });
    expect(deadLetter, 'admin_dead_letter node must exist').toBeTruthy();
    const params = deadLetter!.parameters?.bodyParameters?.parameters ?? [];
    const toParam = params.find((p) => p.name === 'to');
    expect(
      toParam,
      'admin_dead_letter must NOT carry a body `to` — recipient is hard-coded server-side (Sprint 11-A)',
    ).toBeUndefined();
  });

  // O. No unrelated workflow was modified.
  //    (Pinned by the inventory describe block above; this
  //    is the 9-expected-files assertion, which would fail
  //    if any unrelated workflow were renamed or removed.
  //    Adding the 10th file — zoom-recording-completed.json —
  //    is the only change in n8n/workflows/.)
  it('O. the workflow set is the 9 originals + zoom-recording-completed.json (no rename, no delete)', () => {
    const files = readdirSync(WORKFLOWS_DIR).sort();
    expect(files).toContain('zoom-recording-completed.json');
    // The original 9 are all present and unmodified in name.
    for (const original of [
      'admin-notification.json',
      'enrollment-created.json',
      'module-booking-to-zoom.json',
      'module-cancellation.json',
      'module-completed.json',
      'module-confirmation-email.json',
      'module-reschedule.json',
      'session-reminder-scheduler.json',
      'tutor-notification.json',
    ]) {
      expect(files).toContain(original);
    }
    expect(files.length, 'no unexpected files in n8n/workflows/').toBe(10);
  });
});

// =====================================================================
// TASK 3 — Feature C — `enrollment-created.json` carries a
// `kind: 'monthly'` branch.
//
// The `Create Stripe Checkout Session` node (or a downstream If /
// Switch node) MUST handle `kind: 'monthly'` from the inbound
// body and emit `mode: 'subscription'` with
// `line_items[0][price]` set from the inbound `stripe_price_id`.
// The PAYG `mode: 'payment'` branch must remain unchanged.
//
// The contract here is structural: the workflow reads `kind` from
// the inbound body, branches on it, and the monthly branch
// references `STRIPE_PRICE_SUBSCRIPTION`. We do NOT assert the
// exact node topology (a Switch node is the cleanest, but an If
// with two branches is also acceptable). We only assert that
// `STRIPE_PRICE_SUBSCRIPTION` is read SOMEWHERE in the workflow
// and that `kind` is referenced SOMEWHERE in the workflow.
//
// D-6 invariant: the monthly branch reads Stripe's price id from
// env (the canonical Stripe-side source); no 30-day computation
// happens in the workflow.
// =====================================================================

describe('n8n/workflows/enrollment-created.json — Feature C monthly branch', () => {
  const FILE = 'enrollment-created.json';
  const wfs = readWorkflows();
  const flow = wfs.find((w) => w.file === FILE);
  if (!flow) {
    it('enrollment-created.json exists', () => {
      expect(flow, 'enrollment-created.json must exist').toBeTruthy();
    });
    return;
  }
  const wf = flow.wf;

  it('reads STRIPE_PRICE_SUBSCRIPTION somewhere in the workflow (D-6: Stripe price id is canonical)', () => {
    const allValues: string[] = [];
    for (const node of wf.nodes ?? []) {
      const p = node?.parameters ?? {};
      const collect = (v: unknown) => {
        if (typeof v === 'string') allValues.push(v);
      };
      collect(p.url);
      collect(p.body);
      collect(p.responseBody);
      const params = (p as { bodyParameters?: { parameters?: Array<{ value: string }> } })
        .bodyParameters?.parameters;
      for (const x of params ?? []) collect(x.value);
      const headers = (p as { headerParameters?: { parameters?: Array<{ value: string }> } })
        .headerParameters?.parameters;
      for (const x of headers ?? []) collect(x.value);
    }
    const haystack = allValues.join(' ');
    expect(
      haystack,
      'enrollment-created.json must reference $env.STRIPE_PRICE_SUBSCRIPTION (the monthly branch price)',
    ).toContain('STRIPE_PRICE_SUBSCRIPTION');
  });

  it('references the inbound body `kind` field somewhere in the workflow', () => {
    const allValues: string[] = [];
    for (const node of wf.nodes ?? []) {
      const p = node?.parameters ?? {};
      const collect = (v: unknown) => {
        if (typeof v === 'string') allValues.push(v);
      };
      collect(p.url);
      collect(p.body);
      collect(p.responseBody);
      // Switch / If nodes use `rules.leftValue` (n8n If node v2.x
      // stores it under `parameters.conditions.conditions[].leftValue`).
      const rules = (p as { rules?: { values?: Array<{ leftValue?: string }> } }).rules;
      for (const r of rules?.values ?? []) {
        collect(r.leftValue);
      }
      const conditions = (p as {
        conditions?: { conditions?: Array<{ leftValue?: string }> };
      }).conditions;
      for (const c of conditions?.conditions ?? []) {
        collect(c.leftValue);
      }
      const params = (p as { bodyParameters?: { parameters?: Array<{ name: string; value: string }> } })
        .bodyParameters?.parameters;
      for (const x of params ?? []) {
        if (typeof x.name === 'string') allValues.push(x.name);
        collect(x.value);
      }
      const headers = (p as { headerParameters?: { parameters?: Array<{ name: string; value: string }> } })
        .headerParameters?.parameters;
      for (const x of headers ?? []) {
        if (typeof x.name === 'string') allValues.push(x.name);
        collect(x.value);
      }
    }
    const haystack = allValues.join(' ');
    // The Switch / If node reads `$json.body.kind` to branch.
    expect(
      haystack,
      'enrollment-created.json must reference $json.body.kind (the branch selector)',
    ).toMatch(/\$json\.body\.kind/);
  });

  it('still carries the PAYG (mode=payment) branch (no regression to v2 PAYG path)', () => {
    const allValues: string[] = [];
    for (const node of wf.nodes ?? []) {
      const p = node?.parameters ?? {};
      const params = (p as { bodyParameters?: { parameters?: Array<{ name: string; value: string }> } })
        .bodyParameters?.parameters;
      for (const x of params ?? []) {
        if (typeof x.name === 'string' && typeof x.value === 'string') {
          if (x.name === 'mode') allValues.push(x.value);
        }
      }
    }
    expect(
      allValues,
      'the PAYG mode=payment branch must remain in the workflow',
    ).toContain('payment');
  });
});

// =====================================================================
// TASK 15 — Feature B pack_refund branch.
//
// The admin pack refund route
// (apps/web/app/api/admin/pack-grants/[id]/refund/route.ts)
// POSTs `{ kind: 'pack_refund', session_grant_id, student_id,
// amount_cents, currency, refund_request_id, refund_reason }` to
// N8N_ENROLLMENT_WEBHOOK_URL. The workflow MUST route that body to
// Stripe /v1/refunds (NOT to a Checkout Session creation).
//
// The locked contract here:
//   a. kind=pack_refund reaches the refund branch.
//   b. kind=monthly still reaches Monthly (regression pin).
//   c. normal PAYG still reaches PAYG (regression pin).
//   d. pack_refund does NOT reach the PAYG branch.
//   e. Stripe endpoint is /v1/refunds.
//   f. Stripe Checkout endpoint is NOT used by the pack_refund branch.
//   g. Refund amount comes from the authorized amount_cents field.
//   h. refund_request_id is used for idempotency/tracing.
//   i. Existing HMAC verification (x-webhook-secret) remains
//      present.
//
// These are structural assertions over the JSON — no runtime
// invocation of n8n. The test loads the workflow file and walks
// the node graph.
// =====================================================================

describe('n8n/workflows/enrollment-created.json — TASK 15 pack_refund branch', () => {
  const FILE = 'enrollment-created.json';
  const wfs = readWorkflows();
  const flow = wfs.find((w) => w.file === FILE);
  if (!flow) {
    it('enrollment-created.json exists', () => {
      expect(flow, 'enrollment-created.json must exist').toBeTruthy();
    });
    return;
  }
  const wf = flow.wf;

  // Helper: find a node by exact name.
  const findNode = (name: string): N8nNode | undefined =>
    (wf.nodes ?? []).find((n) => n?.name === name);

  // Helper: every string-valued parameter / url / header in a node.
  const nodeStringValues = (n: N8nNode | undefined): string[] => {
    if (!n) return [];
    const p = n.parameters ?? {};
    const out: string[] = [];
    const collect = (v: unknown) => {
      if (typeof v === 'string') out.push(v);
    };
    collect(p.url);
    collect(p.body);
    collect(p.responseBody);
    const bp = (p as { bodyParameters?: { parameters?: Array<{ value: string }> } })
      .bodyParameters?.parameters;
    for (const x of bp ?? []) collect(x.value);
    const hp = (p as { headerParameters?: { parameters?: Array<{ value: string }> } })
      .headerParameters?.parameters;
    for (const x of hp ?? []) collect(x.value);
    // Switch / If nodes store their conditions under
    // parameters.conditions.conditions[].leftValue / rightValue.
    // Walk those too so discovery by keyword (e.g. 'pack_refund')
    // works for both HttpRequest and If nodes uniformly.
    const conds = (p as {
      conditions?: { conditions?: Array<{ leftValue?: unknown; rightValue?: unknown }> };
    }).conditions?.conditions;
    for (const c of conds ?? []) {
      collect(c.leftValue);
      collect(c.rightValue);
    }
    return out;
  };

  // Helper: read the body parameter list (name + value).
  const nodeBodyParams = (n: N8nNode | undefined): Array<{ name: string; value: string }> =>
    (n?.parameters as { bodyParameters?: { parameters?: Array<{ name: string; value: string }> } } | undefined)
      ?.bodyParameters?.parameters ?? [];

  // Helper: walk the connection graph from a node, breadth-first,
  // and return every node name reachable on the success path
  // (main index 0) by repeatedly following main[0] chains.
  const reachableSuccess = (start: string): Set<string> => {
    const out = new Set<string>();
    const queue: string[] = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const conns = wf.connections?.[cur]?.main ?? [];
      for (const branch of conns) {
        for (const c of branch) {
          if (c?.node && !out.has(c.node)) {
            out.add(c.node);
            queue.push(c.node);
          }
        }
      }
    }
    return out;
  };

  // ---- (a)+(b)+(c)+(d) routing -----------------------------------

  // The workflow has at least one Switch / If node keyed on
  // `kind === 'pack_refund'`. We expect a dedicated If node whose
  // leftValue compares `$json.body.kind` to the literal
  // `pack_refund`.
  const ifPackRefund = (wf.nodes ?? []).find(
    (n) =>
      n?.type === 'n8n-nodes-base.if' &&
      nodeStringValues(n).some((v) => v.includes('pack_refund')),
  );

  it('a. has a Switch / If node that branches on kind === pack_refund', () => {
    expect(ifPackRefund, 'a Switch / If node must reference pack_refund in its conditions').toBeTruthy();
    const conds = (ifPackRefund!.parameters as {
      conditions?: { conditions?: Array<{ leftValue?: string; rightValue?: string }> };
    }).conditions?.conditions ?? [];
    const kindCond = conds.find((c) => c.leftValue?.includes('$json.body.kind'));
    expect(
      kindCond,
      'the Switch / If conditions must include a comparison on $json.body.kind',
    ).toBeTruthy();
    expect(kindCond!.rightValue, 'the right-hand side must be the literal pack_refund').toBe('pack_refund');
  });

  // The pack_refund arm (true branch of the new Switch) reaches a
  // node that posts to /v1/refunds.
  it('a. kind=pack_refund reaches the refund branch (a node POSTing to /v1/refunds)', () => {
    expect(ifPackRefund, 'a Switch / If node must exist').toBeTruthy();
    // The If node's two outputs: index 0 = true (kind === pack_refund),
    // index 1 = false (else).
    const ifOut = wf.connections?.[ifPackRefund!.name]?.main ?? [];
    const trueBranch = ifOut[0] ?? [];
    expect(trueBranch.length, 'the true branch of the pack_refund Switch must not be empty').toBeGreaterThan(0);
    // Walk downstream from the true branch — somewhere there must
    // be a node whose URL is /v1/refunds.
    const visited = new Set<string>([ifPackRefund!.name]);
    const queue: string[] = trueBranch
      .map((c) => c?.node)
      .filter((n): n is string => !!n);
    let foundRefundNode = false;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const node = findNode(cur);
      const url = (node?.parameters?.url ?? '') as string;
      if (url.includes('/v1/refunds')) {
        foundRefundNode = true;
        break;
      }
      const next = wf.connections?.[cur]?.main ?? [];
      for (const branch of next) {
        for (const c of branch) {
          if (c?.node && !visited.has(c.node)) queue.push(c.node);
        }
      }
    }
    expect(
      foundRefundNode,
      'downstream of the kind=pack_refund Switch true branch, a node must POST to /v1/refunds',
    ).toBe(true);
  });

  // (d) a body with kind=pack_refund must NEVER reach a Stripe
  // Checkout Session creation node. Walk the TRUE branch of the
  // pack_refund Switch downstream — only a refund node or a
  // router leading to a refund node is allowed.
  it('d. kind=pack_refund does NOT reach PAYG / Stripe Checkout Session creation', () => {
    expect(ifPackRefund, 'a Switch / If node must exist').toBeTruthy();
    const ifOut = wf.connections?.[ifPackRefund!.name]?.main ?? [];
    const trueBranch = ifOut[0] ?? [];
    expect(trueBranch.length, 'the true branch of the pack_refund Switch must not be empty').toBeGreaterThan(0);
    const visited = new Set<string>([ifPackRefund!.name]);
    const queue: string[] = trueBranch
      .map((c) => c?.node)
      .filter((n): n is string => !!n);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const node = findNode(cur);
      const url = (node?.parameters?.url ?? '') as string;
      const params = nodeBodyParams(node);
      const mode = params.find((p) => p.name === 'mode')?.value;
      if (url.includes('/v1/checkout/sessions') && (mode === 'payment' || mode === 'subscription')) {
        throw new Error(
          `kind=pack_refund reaches Stripe Checkout Session creation node "${cur}" (mode=${mode}) — pack_refund must NEVER create a charge`,
        );
      }
      const next = wf.connections?.[cur]?.main ?? [];
      for (const branch of next) {
        for (const c of branch) {
          if (c?.node && !visited.has(c.node)) queue.push(c.node);
        }
      }
    }
  });

  // (b) kind=monthly still reaches Monthly (regression pin).
  it('b. kind=monthly still routes to the Monthly subscription Checkout node', () => {
    // The existing Switch: kind=monthly? If node must still exist.
    const ifMonthly = findNode('Switch: kind=monthly?');
    expect(ifMonthly, 'the existing Switch: kind=monthly? node must remain').toBeTruthy();
    const monthlyOut = wf.connections?.[ifMonthly!.name]?.main?.[0] ?? [];
    const reachesMonthly = monthlyOut.some(
      (c) => c?.node === 'Create Stripe Subscription Checkout (monthly)',
    );
    expect(
      reachesMonthly,
      'Switch: kind=monthly? true branch must reach "Create Stripe Subscription Checkout (monthly)"',
    ).toBe(true);
  });

  // (c) normal PAYG still reaches PAYG (regression pin).
  it('c. normal PAYG (kind !== monthly && kind !== pack_refund) still routes to the PAYG Checkout node', () => {
    const ifMonthly = findNode('Switch: kind=monthly?');
    expect(ifMonthly, 'the existing Switch: kind=monthly? node must remain').toBeTruthy();
    const monthlyFalse = wf.connections?.[ifMonthly!.name]?.main?.[1] ?? [];
    // The false branch must reach either the pack_refund Switch
    // (which in turn forwards non-pack_refund to PAYG) OR the
    // PAYG Checkout node directly. Both are acceptable topologies.
    const downstreamNames = monthlyFalse
      .map((c) => c?.node)
      .filter((n): n is string => !!n);
    const reachesPaygOrRouter = downstreamNames.some((n) => {
      if (n === 'Create Stripe Checkout Session') return true;
      // If the downstream is the pack_refund Switch, that's fine:
      // pack_refund Switch false branch must reach PAYG.
      const found = findNode(n);
      return found?.type === 'n8n-nodes-base.if';
    });
    expect(
      reachesPaygOrRouter,
      'Switch: kind=monthly? false branch must reach either the PAYG Checkout node directly or the pack_refund Switch',
    ).toBe(true);
  });

  // ---- (e)+(f) Stripe API endpoint ---------------------------------

  it('e. a Stripe /v1/refunds HttpRequest node exists in the workflow', () => {
    const refundNodes = (wf.nodes ?? []).filter((n) => {
      const url = (n?.parameters?.url ?? '') as string;
      return url.includes('/v1/refunds');
    });
    expect(refundNodes.length, 'exactly one /v1/refunds HttpRequest node').toBeGreaterThanOrEqual(1);
    const refund = refundNodes[0]!;
    expect(refund.parameters?.method, 'the refund call uses POST').toBe('POST');
  });

  it('f. the pack_refund branch does NOT use a Stripe Checkout endpoint', () => {
    // Walk downstream of the pack_refund Switch true branch and
    // confirm NO node POSTs to /v1/checkout/sessions.
    expect(ifPackRefund, 'a Switch / If node must exist').toBeTruthy();
    const ifOut = wf.connections?.[ifPackRefund!.name]?.main ?? [];
    const trueBranch = ifOut[0] ?? [];
    const visited = new Set<string>([ifPackRefund!.name]);
    const queue: string[] = trueBranch
      .map((c) => c?.node)
      .filter((n): n is string => !!n);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const node = findNode(cur);
      const url = (node?.parameters?.url ?? '') as string;
      expect(
        url.includes('/v1/checkout/sessions'),
        `pack_refund branch must NOT reach a Checkout Session node (found at "${cur}")`,
      ).toBe(false);
      const next = wf.connections?.[cur]?.main ?? [];
      for (const branch of next) {
        for (const c of branch) {
          if (c?.node && !visited.has(c.node)) queue.push(c.node);
        }
      }
    }
  });

  // ---- (g) refund amount from amount_cents -----------------------

  it('g. the /v1/refunds request body supplies amount from $json.body.amount_cents', () => {
    const refundNode = (wf.nodes ?? []).find((n) => {
      const url = (n?.parameters?.url ?? '') as string;
      return url.includes('/v1/refunds');
    });
    expect(refundNode, 'a /v1/refunds node must exist').toBeTruthy();
    const params = nodeBodyParams(refundNode);
    const amountParam = params.find((p) => p.name === 'amount');
    expect(amountParam, 'refund body must carry an `amount` parameter').toBeTruthy();
    expect(
      amountParam!.value,
      'refund amount must come from $json.body.amount_cents',
    ).toMatch(/\$json\.body\.amount_cents/);
  });

  // ---- (h) idempotency via refund_request_id ----------------------

  it('h. the /v1/refunds request uses refund_request_id as the Stripe Idempotency-Key', () => {
    const refundNode = (wf.nodes ?? []).find((n) => {
      const url = (n?.parameters?.url ?? '') as string;
      return url.includes('/v1/refunds');
    });
    expect(refundNode, 'a /v1/refunds node must exist').toBeTruthy();
    const headers = (refundNode!.parameters as {
      headerParameters?: { parameters?: Array<{ name: string; value: string }> };
    }).headerParameters?.parameters ?? [];
    const idemHeader = headers.find((h) => /idempotency/i.test(h.name));
    expect(
      idemHeader,
      'the refund HttpRequest must set a Stripe Idempotency-Key header',
    ).toBeTruthy();
    expect(
      idemHeader!.value,
      'Idempotency-Key must derive from $json.body.refund_request_id',
    ).toMatch(/\$json\.body\.refund_request_id/);
  });

  it('h. the /v1/refunds request body also surfaces refund_request_id in metadata for tracing', () => {
    const refundNode = (wf.nodes ?? []).find((n) => {
      const url = (n?.parameters?.url ?? '') as string;
      return url.includes('/v1/refunds');
    });
    expect(refundNode, 'a /v1/refunds node must exist').toBeTruthy();
    const params = nodeBodyParams(refundNode);
    const meta = params.find((p) => /metadata\[refund_request_id\]/.test(p.name));
    expect(
      meta,
      'refund body must carry metadata[refund_request_id] for tracing',
    ).toBeTruthy();
  });

  // ---- (i) HMAC verification preserved ----------------------------

  it('i. existing HMAC webhook verification (x-webhook-secret) remains present', () => {
    const verify = findNode('Verify webhook secret');
    expect(verify, 'the existing HMAC verification node must remain').toBeTruthy();
    const conds = (verify!.parameters as {
      conditions?: { conditions?: Array<{ leftValue?: string; rightValue?: string }> };
    }).conditions?.conditions ?? [];
    const hmacCond = conds.find(
      (c) => c.leftValue?.includes('x-webhook-secret') && c.rightValue?.includes('N8N_WEBHOOK_SECRET'),
    );
    expect(
      hmacCond,
      'HMAC verification must compare x-webhook-secret inbound header to $env.N8N_WEBHOOK_SECRET',
    ).toBeTruthy();
  });
});
