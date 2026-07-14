'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';

// =====================================================================
// Sprint 3.6 §5.7 — admin upload form for the Excel curriculum
// importer. Client component. Posts a multipart/form-data
// request to POST /api/admin/import-excel and renders the
// structured response (parsed tree + import report + error
// list).
//
// The form is intentionally minimal: file + language toggle +
// dry-run checkbox + submit. There is no `react-hook-form`
// dependency; plain useState is enough for the four fields.
// The form is the only entry point to the route and is
// admin-only (the layout calls requireAdmin() before
// reaching this component, so the route's own admin gate
// is a defence-in-depth check).
// =====================================================================

type ImportLanguage = 'en' | 'fr';

interface ImportReport {
  ok: boolean;
  counts: {
    programs: number;
    grades: number;
    courses: number;
    chapters: number;
    sessions: number;
    skipped: number;
  };
  errors: ReadonlyArray<{ sheet: string; row: number; reason: string }>;
}

interface ParsedSummary {
  language: ImportLanguage;
  programs: number;
  grades: number;
  courses: number;
  chapters: number;
  sessions: number;
  errors: ReadonlyArray<{ sheet: string; row: number; reason: string }>;
}

interface ImportResponse {
  ok: boolean;
  dryRun: boolean;
  parsed: ParsedSummary;
  report: ImportReport | null;
}

type FormState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done'; response: ImportResponse; dryRunNotice: boolean }
  | { kind: 'error'; message: string };

export interface ImportExcelFormProps {
  /**
   * Optional className for the outer wrapper. Used by the
   * admin page to align with `AdminListPage` width.
   */
  className?: string;
}

export function ImportExcelForm({ className }: ImportExcelFormProps): React.JSX.Element {
  const t = useTranslations('Admin.import');

  const [file, setFile] = React.useState<File | null>(null);
  const [language, setLanguage] = React.useState<ImportLanguage>('en');
  const [dryRun, setDryRun] = React.useState<boolean>(true);
  const [state, setState] = React.useState<FormState>({ kind: 'idle' });

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!file) {
      setState({ kind: 'error', message: t('noFile') });
      return;
    }
    setState({ kind: 'submitting' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('language', language);
    formData.append('dryRun', dryRun ? 'true' : 'false');

    try {
      const res = await fetch('/api/admin/import-excel', {
        method: 'POST',
        body: formData,
        // No `Content-Type` header — let the browser set the
        // multipart boundary. Setting it manually breaks the
        // upload.
      });
      const data = (await res.json()) as ImportResponse;
      // The route returns 200 for both success and dry-run;
      // 422 carries parsed errors; 4xx/5xx carry an
      // `{error: ...}` envelope. The form treats any non-2xx
      // as a hard failure with a generic message; the
      // operator can check the network tab.
      if (!res.ok) {
        setState({
          kind: 'error',
          message: `${t('failure')} (${res.status})`,
        });
        return;
      }
      setState({ kind: 'done', response: data, dryRunNotice: data.dryRun });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : t('failure'),
      });
    }
  };

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('subline')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="import-excel-file"
                className="text-sm font-medium leading-none"
              >
                {t('fileLabel')}
              </label>
              <input
                id="import-excel-file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-primary-foreground"
                disabled={state.kind === 'submitting'}
              />
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium leading-none">
                {t('languageLabel')}
              </legend>
              <div className="flex gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="language"
                    value="en"
                    checked={language === 'en'}
                    onChange={() => setLanguage('en')}
                    disabled={state.kind === 'submitting'}
                  />
                  {t('languageEn')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="language"
                    value="fr"
                    checked={language === 'fr'}
                    onChange={() => setLanguage('fr')}
                    disabled={state.kind === 'submitting'}
                  />
                  {t('languageFr')}
                </label>
              </div>
            </fieldset>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                disabled={state.kind === 'submitting'}
              />
              {t('dryRunLabel')}
            </label>

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={state.kind === 'submitting'}>
                {state.kind === 'submitting' ? t('running') : t('run')}
              </Button>
              {state.kind === 'error' ? (
                <p className="text-sm text-destructive">{state.message}</p>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {state.kind === 'done' ? <ImportResult state={state.response} dryRunNotice={state.dryRunNotice} t={t} /> : null}
    </div>
  );
}

interface ImportResultProps {
  state: ImportResponse;
  dryRunNotice: boolean;
  t: ReturnType<typeof useTranslations<'Admin.import'>>;
}

function ImportResult({ state, dryRunNotice, t }: ImportResultProps): React.JSX.Element {
  const heading = state.dryRun
    ? t('dryRunNotice')
    : state.ok
      ? t('success')
      : state.report
        ? t('partial')
        : t('failure');

  const summarySource =
    state.report ?? {
      counts: {
        programs: state.parsed.programs,
        grades: state.parsed.grades,
        courses: state.parsed.courses,
        chapters: state.parsed.chapters,
        sessions: state.parsed.sessions,
        skipped: 0,
      },
      errors: [],
    };

  const counts = summarySource.counts;
  const errors =
    state.report?.errors && state.report.errors.length > 0
      ? state.report.errors
      : state.parsed.errors;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {dryRunNotice ? null : (
          <p className="text-sm text-muted-foreground">
            {t('summary', {
              programs: counts.programs,
              grades: counts.grades,
              courses: counts.courses,
              chapters: counts.chapters,
              sessions: counts.sessions,
              skipped: counts.skipped,
            })}
          </p>
        )}
        {errors.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t('errorsHeading')}</p>
            <ul className="space-y-1 text-sm text-destructive" role="list">
              {errors.map((err, i) => (
                <li key={i}>
                  {err.sheet}#{err.row}: {err.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
