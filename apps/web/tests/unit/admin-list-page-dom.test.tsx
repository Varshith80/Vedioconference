import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';

// Mock the heavy dependencies that AdminListPage transitively
// pulls in. We only need the component's table layout to be
// rendered, not the real services, i18n, or auth.
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (k: string) => k),
  setRequestLocale: vi.fn(),
}));

vi.mock('@/components/shared/container', () => ({
  Container: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));
vi.mock('@/components/shared/section', () => ({
  Section: ({ children }: { children: React.ReactNode }) =>
    React.createElement('section', null, children),
}));
vi.mock('@/components/shared/heading', () => ({
  Heading: ({ children }: { children: React.ReactNode }) =>
    React.createElement('h1', null, children),
}));
vi.mock('@/components/shared/empty-state', () => ({
  EmptyState: () => null,
}));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  CardContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));
vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) =>
    React.createElement('span', null, children),
}));

import { AdminListPage } from '@/components/admin/admin-list-page';

type Program = {
  id: string;
  title: string;
  is_published: boolean;
};

type Course = Program & { program: string };

type Solo = { id: string; name: string };

describe('AdminListPage DOM contract', () => {
  it('renders N+1 tds per row when actions prop is provided (2-col)', () => {
    const items: Program[] = [
      { id: 'a', title: 'BTS ABM', is_published: true },
      { id: 'b', title: 'MPSI', is_published: false },
    ];
    const html = renderToStaticMarkup(
      React.createElement(AdminListPage<Program>, {
        title: 'Programs',
        subline: 'Manage programs',
        empty: 'No programs',
        emptyIcon: null,
        items,
        getKey: (p) => p.id,
        columns: [
          { key: 'title', label: 'Name', width: 'min-w-[280px]' },
          { key: 'pub', label: 'Status', width: 'w-32' },
        ],
        actions: (p) =>
          React.createElement(
            'span',
            { 'data-testid': `actions-${p.id}` },
            'edit-delete-buttons',
          ),
        renderItem: (p) =>
          React.createElement(
            React.Fragment,
            null,
            React.createElement('span', { className: 'name' }, p.title),
            React.createElement(
              'span',
              { className: 'badge' },
              p.is_published ? 'Published' : 'Draft',
            ),
          ),
      }),
    );

    // Count thead th elements: 2 columns + 1 actions = 3
    const thMatches = html.match(/<th\b/g) ?? [];
    expect(thMatches.length).toBe(3);

    // First body row td count must equal thead th count
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) throw new Error('No tbody found');
    const tbodyHtml = tbodyMatch[1] ?? '';
    const firstTrMatch = tbodyHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/);
    if (!firstTrMatch) throw new Error('No body tr found');
    const firstTr = firstTrMatch[0];
    const tdMatches = firstTr.match(/<td\b/g) ?? [];
    expect(tdMatches.length).toBe(3); // 2 data + 1 actions

    // The actions marker is in the LAST td of the first row
    const actionsIndex = html.indexOf('data-testid="actions-a"');
    expect(actionsIndex).toBeGreaterThan(-1);

    // The last <td> of the first body row must contain the
    // actions marker and ONLY the actions marker.
    const lastTdStart = html.lastIndexOf('<td', actionsIndex);
    const lastTdEnd = html.indexOf('</td>', actionsIndex);
    const lastTdContent = html.slice(lastTdStart, lastTdEnd + 5);
    expect(lastTdContent).toContain('actions-a');
    expect(lastTdContent).not.toContain('badge');

    // The FIRST <td> of the first body row must contain the
    // name and ONLY the name, not the badge.
    const firstRowStart = tbodyHtml.indexOf('<tr');
    const firstRowEnd = tbodyHtml.indexOf('</tr>', firstRowStart);
    const firstRowHtml = tbodyHtml.slice(firstRowStart, firstRowEnd);
    const firstTdStart = firstRowHtml.indexOf('<td');
    const firstTdEnd = firstRowHtml.indexOf('</td>', firstTdStart);
    const firstTdContent = firstRowHtml.slice(firstTdStart, firstTdEnd + 5);
    expect(firstTdContent).toContain('BTS ABM');
    expect(firstTdContent).not.toContain('Published');
  });

  it('renders N+1 tds for a 3-column page (courses / chapters)', () => {
    const items: Course[] = [
      {
        id: 'c1',
        title: 'Algèbre linéaire',
        program: 'MPSI',
        is_published: true,
      },
    ];
    const html = renderToStaticMarkup(
      React.createElement(AdminListPage<Course>, {
        title: 'Courses',
        subline: 'Manage courses',
        empty: 'No courses',
        emptyIcon: null,
        items,
        getKey: (c) => c.id,
        columns: [
          { key: 'title', label: 'Course', width: 'min-w-[260px]' },
          { key: 'prog', label: 'Program', width: 'min-w-[200px]' },
          { key: 'pub', label: 'Published', width: 'w-32' },
        ],
        actions: (c) =>
          React.createElement(
            'span',
            { 'data-testid': `actions-${c.id}` },
            'edit-delete',
          ),
        renderItem: (c) =>
          React.createElement(
            React.Fragment,
            null,
            React.createElement('span', { className: 'title' }, c.title),
            React.createElement('span', { className: 'program' }, c.program),
            React.createElement(
              'span',
              { className: 'badge' },
              c.is_published ? 'Yes' : 'No',
            ),
          ),
      }),
    );
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) throw new Error('No tbody');
    const tbodyHtml = tbodyMatch[1] ?? '';
    const firstTr = tbodyHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/);
    if (!firstTr) throw new Error('No body tr');
    const tdCount = (firstTr[0].match(/<td\b/g) ?? []).length;
    const thCount = (html.match(/<th\b/g) ?? []).length;
    expect(thCount).toBe(4); // 3 columns + 1 actions
    expect(tdCount).toBe(4); // 3 data + 1 actions
  });

  it('regression: programs page renderItem (2-span fragment + 1 action)', () => {
    // This mirrors apps/web/app/[locale]/admin/programs/page.tsx
    // renderItem: returns a 2-span fragment (title + status badge).
    const items: Program[] = [
      { id: 'p1', title: 'BTS ABM', is_published: true },
      { id: 'p2', title: 'MPSI', is_published: false },
    ];
    const html = renderToStaticMarkup(
      React.createElement(AdminListPage<Program>, {
        title: 'Programs',
        subline: 'Manage programs',
        empty: 'No programs',
        emptyIcon: null,
        items,
        getKey: (p) => p.id,
        columns: [
          { key: 'title', label: 'Name', width: 'min-w-[280px]' },
          { key: 'pub', label: 'Status', width: 'w-32' },
        ],
        actions: (p) =>
          React.createElement(
            'span',
            { 'data-testid': `act-${p.id}` },
            'edit-delete',
          ),
        renderItem: (p) =>
          React.createElement(
            React.Fragment,
            null,
            React.createElement(
              'span',
              { className: 'font-medium' },
              p.title,
            ),
            React.createElement(
              'span',
              { className: 'text-xs' },
              p.is_published ? 'Published' : 'Draft',
            ),
          ),
      }),
    );
    // 2 columns + 1 actions header
    const thCount = (html.match(/<th\b/g) ?? []).length;
    expect(thCount).toBe(3);
    // First body row: 2 data cells + 1 actions cell
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) throw new Error('No tbody');
    const tbodyHtml = tbodyMatch[1] ?? '';
    const firstTr = tbodyHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/);
    if (!firstTr) throw new Error('No body tr');
    const tdCount = (firstTr[0].match(/<td\b/g) ?? []).length;
    expect(tdCount).toBe(3);
  });

  it('regression: courses page renderItem (3-span fragment + 1 action)', () => {
    // Mirrors apps/web/app/[locale]/admin/courses/page.tsx
    // renderItem: 3-span fragment (title, program, published badge).
    const items: Course[] = [
      {
        id: 'c1',
        title: 'Algèbre',
        program: 'MPSI',
        is_published: true,
      },
    ];
    const html = renderToStaticMarkup(
      React.createElement(AdminListPage<Course>, {
        title: 'Courses',
        subline: 'Manage courses',
        empty: 'No courses',
        emptyIcon: null,
        items,
        getKey: (c) => c.id,
        columns: [
          { key: 'title', label: 'Course', width: 'min-w-[260px]' },
          { key: 'prog', label: 'Program', width: 'min-w-[200px]' },
          { key: 'pub', label: 'Published', width: 'w-32' },
        ],
        actions: (c) =>
          React.createElement('span', { 'data-testid': 'act' }, 'edit'),
        renderItem: (c) =>
          React.createElement(
            React.Fragment,
            null,
            React.createElement('span', { className: 'title' }, c.title),
            React.createElement('span', { className: 'prog' }, c.program),
            React.createElement('span', { className: 'badge' }, 'Yes'),
          ),
      }),
    );
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) throw new Error('No tbody');
    const tbodyHtml = tbodyMatch[1] ?? '';
    const firstTr = tbodyHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/);
    if (!firstTr) throw new Error('No body tr');
    const tdCount = (firstTr[0].match(/<td\b/g) ?? []).length;
    const thCount = (html.match(/<th\b/g) ?? []).length;
    expect(thCount).toBe(4); // 3 columns + 1 actions
    expect(tdCount).toBe(4); // 3 data + 1 actions
  });

  it('regression: tutors page renderItem (6-span fragment + 1 action)', () => {
    // Mirrors apps/web/app/[locale]/admin/tutors/page.tsx
    // renderItem: 6-span fragment (name+phone, email, active count,
    // total count, status badge, joined date). The page must
    // inline the Fragment — returning a wrapper component
    // (<TutorRow />) would collapse all 6 cells into one <td>.
    type Tutor = {
      id: string;
      full_name: string;
      phone: string | null;
      email: string;
      status: 'active' | 'inactive';
      created_at: string;
    };
    const items: Tutor[] = [
      {
        id: 't1',
        full_name: 'Kudithyala Varshith',
        phone: '09110590087',
        email: 'manivarshithkudithyala@gmail.com',
        status: 'active',
        created_at: '2026-07-20T12:00:00Z',
      },
    ];
    const html = renderToStaticMarkup(
      React.createElement(AdminListPage<Tutor>, {
        title: 'Tutors',
        subline: 'Directory',
        empty: 'No tutors',
        emptyIcon: null,
        items,
        getKey: (tu) => tu.id,
        columns: [
          { key: 'name', label: 'Name', width: 'min-w-[200px]' },
          { key: 'email', label: 'Email', width: 'min-w-[200px]' },
          { key: 'act', label: 'Active', width: 'w-28' },
          { key: 'tot', label: 'Total', width: 'w-32' },
          { key: 'status', label: 'Status', width: 'w-28' },
          { key: 'join', label: 'Joined', width: 'w-32' },
        ],
        actions: (tu) =>
          React.createElement(
            'a',
            { href: `./tutors/${tu.id}` },
            'Tutor →',
          ),
        renderItem: (tu) =>
          React.createElement(
            React.Fragment,
            null,
            React.createElement(
              'span',
              { className: 'flex flex-col text-xs' },
              React.createElement(
                'span',
                { className: 'font-medium' },
                tu.full_name,
              ),
              tu.phone
                ? React.createElement(
                    'span',
                    { className: 'text-muted-foreground' },
                    tu.phone,
                  )
                : null,
            ),
            React.createElement(
              'span',
              { className: 'text-xs' },
              tu.email,
            ),
            React.createElement(
              'span',
              { className: 'text-xs' },
              '0',
            ),
            React.createElement(
              'span',
              { className: 'text-xs' },
              '0',
            ),
            React.createElement(
              'span',
              { className: 'text-xs' },
              tu.status === 'active'
                ? React.createElement(
                    'span',
                    { className: 'badge' },
                    'Active',
                  )
                : React.createElement(
                    'span',
                    { className: 'badge' },
                    'Inactive',
                  ),
            ),
            React.createElement(
              'span',
              { className: 'font-mono' },
              tu.created_at.slice(0, 10),
            ),
          ),
      }),
    );
    // 6 columns + 1 actions header
    const thCount = (html.match(/<th\b/g) ?? []).length;
    expect(thCount).toBe(7);
    // First body row: 6 data cells + 1 actions cell
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) throw new Error('No tbody');
    const tbodyHtml = tbodyMatch[1] ?? '';
    const firstTr = tbodyHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/);
    if (!firstTr) throw new Error('No body tr');
    const tdCount = (firstTr[0].match(/<td\b/g) ?? []).length;
    expect(tdCount).toBe(7);

    // The FIRST <td> must contain the full_name and the phone
    // (both inside the stacked Name cell), but NOT the email,
    // NOT the joined date.
    const firstRowStart = tbodyHtml.indexOf('<tr');
    const firstRowEnd = tbodyHtml.indexOf('</tr>', firstRowStart);
    const firstRowHtml = tbodyHtml.slice(firstRowStart, firstRowEnd);
    const firstTdStart = firstRowHtml.indexOf('<td');
    const firstTdEnd = firstRowHtml.indexOf('</td>', firstTdStart);
    const firstTdContent = firstRowHtml.slice(firstTdStart, firstTdEnd + 5);
    expect(firstTdContent).toContain('Kudithyala Varshith');
    expect(firstTdContent).toContain('09110590087');
    expect(firstTdContent).not.toContain('manivarshithkudithyala@gmail.com');
    expect(firstTdContent).not.toContain('2026-07-20');

    // The second <td> must contain the email and ONLY the email.
    const secondTdStart = firstRowHtml.indexOf('<td', firstTdEnd);
    const secondTdEnd = firstRowHtml.indexOf('</td>', secondTdStart);
    const secondTdContent = firstRowHtml.slice(
      secondTdStart,
      secondTdEnd + 5,
    );
    expect(secondTdContent).toContain('manivarshithkudithyala@gmail.com');
    expect(secondTdContent).not.toContain('Kudithyala');

    // The joined-date cell is the 6th <td> (the 6th column).
    // The 7th <td> is the actions cell ("Tutor →").
    // The 6th cell must contain the joined date and ONLY that.
    const tds: string[] = [];
    let searchStart = 0;
    while (true) {
      const tdStart = firstRowHtml.indexOf('<td', searchStart);
      if (tdStart === -1) break;
      const tdEnd = firstRowHtml.indexOf('</td>', tdStart);
      if (tdEnd === -1) break;
      tds.push(firstRowHtml.slice(tdStart, tdEnd + 5));
      searchStart = tdEnd + 5;
    }
    expect(tds.length).toBe(7);
    // Column 6 (joined) holds the date and not the name.
    expect(tds[5]).toContain('2026-07-20');
    expect(tds[5]).not.toContain('Kudithyala');
    expect(tds[5]).not.toContain('manivarshith');
    // Column 7 (actions) holds the link and not the date.
    expect(tds[6]).toContain('Tutor');
    expect(tds[6]).not.toContain('2026-07-20');
  });

  it('regression: renderItem that returns a wrapper component (not a Fragment) collapses to 1 cell', () => {
    // Documents the failure mode the Tutors page was hitting
    // before the fix: renderItem returns <WrapperComponent />
    // instead of a Fragment. The wrapper element counts as ONE
    // child, so the entire row collapses to a single <td>.
    type Item = { id: string; name: string };
    const items: Item[] = [{ id: '1', name: 'Solo' }];
    function Wrapper({ name }: { name: string }): React.JSX.Element {
      return React.createElement(React.Fragment, null, name);
    }
    const html = renderToStaticMarkup(
      React.createElement(AdminListPage<Item>, {
        title: 'T',
        subline: '',
        empty: '',
        emptyIcon: null,
        items,
        getKey: (i) => i.id,
        columns: [
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
          { key: 'c', label: 'C' },
        ],
        actions: () => React.createElement('span', null, 'act'),
        // WRONG: returning a component element, not a Fragment.
        // This is the bug pattern the Tutors page had.
        renderItem: (i) => React.createElement(Wrapper, { name: i.name }),
      }),
    );
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) throw new Error('No tbody');
    const tbodyHtml = tbodyMatch[1] ?? '';
    const firstTr = tbodyHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/);
    if (!firstTr) throw new Error('No body tr');
    const tdCount = (firstTr[0].match(/<td\b/g) ?? []).length;
    const thCount = (html.match(/<th\b/g) ?? []).length;
    // 3 columns + 1 actions = 4 th.
    expect(thCount).toBe(4);
    // But only 1 data cell + 1 actions = 2 td — the bug.
    expect(tdCount).toBe(2);
  });

  it('handles a single non-fragment cell (1 column with action)', () => {
    const items: Solo[] = [{ id: 'x', name: 'Solo' }];
    const html = renderToStaticMarkup(
      React.createElement(AdminListPage<Solo>, {
        title: 'Solo',
        subline: 'one column',
        empty: 'none',
        emptyIcon: null,
        items,
        getKey: (i) => i.id,
        columns: [{ key: 'name', label: 'Name', width: 'min-w-[200px]' }],
        actions: (i) =>
          React.createElement('span', { 'data-testid': `act-${i.id}` }, 'a'),
        renderItem: (i) =>
          React.createElement('span', { className: 'cell' }, i.name),
      }),
    );
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) throw new Error('No tbody');
    const tbodyHtml = tbodyMatch[1] ?? '';
    const firstTr = tbodyHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/);
    if (!firstTr) throw new Error('No body tr');
    const tdCount = (firstTr[0].match(/<td\b/g) ?? []).length;
    const thCount = (html.match(/<th\b/g) ?? []).length;
    expect(thCount).toBe(2); // 1 column + 1 actions
    expect(tdCount).toBe(2); // 1 data + 1 actions
  });
});
