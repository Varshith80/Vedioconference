'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  adminResourceCreateSchema,
  type AdminResourceCreateInput,
} from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 8 — admin "Create resource" form. POSTs
// /api/admin/resources.
//
// The form carries the user-supplied fields (title, description,
// file metadata, optional FKs, visibility). The admin role is
// enforced by the route. The server stamps `uploaded_by` from
// auth.uid(); clients never send it.
//
// file_path is a free-form string today (typically a Supabase
// Storage path like `resources/<filename>`). Uploading the actual
// file is out of scope for this slice — see S8-D for the
// follow-up recording surface; a parallel storage-upload slice
// is the proper next step (NOT this sprint).
// =====================================================================

export interface ResourceCreateFormProps {
  className?: string;
}

export function ResourceCreateForm({
  className,
}: ResourceCreateFormProps): React.JSX.Element {
  const t = useTranslations('Admin.resourceCreate');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();

  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdminResourceCreateInput>({
    resolver: zodResolver(adminResourceCreateSchema),
    defaultValues: {
      title: '',
      description: '',
      file_name: '',
      file_path: '',
      mime_type: '',
      size_bytes: undefined,
      visibility: 'enrolled',
    },
  });

  async function onSubmit(values: AdminResourceCreateInput): Promise<void> {
    setSubmitting(true);
    setServerError(null);
    try {
      // Strip empty optional fields so the API does not receive
      // "" where it expects null. Zod's `.optional().nullable()`
      // accepts both; we coerce empty strings to null so the
      // server's NOT NULL constraints are respected.
      const payload: Record<string, unknown> = {
        title: values.title,
        file_name: values.file_name,
        file_path: values.file_path,
        visibility: values.visibility ?? 'enrolled',
      };
      if (values.description && values.description.length > 0) {
        payload['description'] = values.description;
      }
      if (values.mime_type && values.mime_type.length > 0) {
        payload['mime_type'] = values.mime_type;
      }
      if (
        values.size_bytes !== undefined &&
        values.size_bytes !== null &&
        Number.isFinite(values.size_bytes)
      ) {
        payload['size_bytes'] = values.size_bytes;
      }

      const res = await fetch('/api/admin/resources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { error?: { message?: string; details?: { reason?: string } } }
          | null;
        const apiMessage = errBody?.error?.message;
        const reason = errBody?.error?.details?.reason;
        if (apiMessage && reason) {
          setServerError(`${apiMessage} (${reason})`);
        } else {
          setServerError(apiMessage ?? tForms('saveError'));
        }
        return;
      }
      reset({
        title: '',
        description: '',
        file_name: '',
        file_path: '',
        mime_type: '',
        size_bytes: undefined,
        visibility: 'enrolled',
      });
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : tForms('saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('subline')}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <Label htmlFor="resource-title-new">{t('fields.title')}</Label>
            <Input
              id="resource-title-new"
              {...register('title')}
              aria-invalid={errors.title ? 'true' : 'false'}
            />
            {errors.title ? (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="resource-description-new">{t('fields.description')}</Label>
            <Textarea
              id="resource-description-new"
              rows={2}
              {...register('description')}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="resource-file-name-new">{t('fields.fileName')}</Label>
              <Input
                id="resource-file-name-new"
                {...register('file_name')}
                aria-invalid={errors.file_name ? 'true' : 'false'}
              />
              {errors.file_name ? (
                <p className="text-xs text-destructive">{errors.file_name.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="resource-file-path-new">{t('fields.filePath')}</Label>
              <Input
                id="resource-file-path-new"
                {...register('file_path')}
                aria-invalid={errors.file_path ? 'true' : 'false'}
              />
              {errors.file_path ? (
                <p className="text-xs text-destructive">{errors.file_path.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="resource-mime-type-new">{t('fields.mimeType')}</Label>
              <Input
                id="resource-mime-type-new"
                {...register('mime_type')}
                placeholder={t('placeholders.mimeType')}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="resource-size-bytes-new">{t('fields.sizeBytes')}</Label>
              <Input
                id="resource-size-bytes-new"
                type="number"
                min={0}
                {...register('size_bytes')}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="resource-visibility-new">{t('fields.visibility')}</Label>
            <select
              id="resource-visibility-new"
              {...register('visibility')}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              defaultValue="enrolled"
            >
              <option value="public">{t('visibilityOptions.public')}</option>
              <option value="enrolled">{t('visibilityOptions.enrolled')}</option>
              <option value="private">{t('visibilityOptions.private')}</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting}>
              <Plus className="h-4 w-4" aria-hidden={true} />
              {submitting ? tForms('submitting') : t('submit')}
            </Button>
            {serverError ? (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}