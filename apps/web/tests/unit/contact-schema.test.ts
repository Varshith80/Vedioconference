import { describe, it, expect } from 'vitest';
import { makeContactSchema } from '@/lib/validations/contact';

const DICT: Record<string, string> = {
  'Validation.emailInvalid': 'Invalid email address.',
  'Validation.contact.nameShort': 'The name is too short.',
  'Validation.contact.subjectShort': 'The subject is too short.',
  'Validation.contact.messageMin': 'The message must contain at least 20 characters.',
};
const t = (k: string): string => DICT[k] ?? k;

describe('makeContactSchema', () => {
  const schema = makeContactSchema(t);

  it('accepts a valid payload', () => {
    const r = schema.safeParse({
      name: 'Jean Dupont',
      email: 'jean@example.com',
      subject: 'Question sur les tarifs',
      message: 'Bonjour, je souhaite en savoir plus sur vos formules pour la terminale.',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a non-empty honeypot', () => {
    const r = schema.safeParse({
      name: 'Jean Dupont',
      email: 'jean@example.com',
      subject: 'Question',
      message: 'Bonjour, je souhaite en savoir plus sur vos formules.',
      website: 'http://spam.example.com',
    });
    expect(r.success).toBe(false);
  });

  it('rejects a too-short message', () => {
    const r = schema.safeParse({
      name: 'Jean',
      email: 'jean@example.com',
      subject: 'Question',
      message: 'trop court',
    });
    expect(r.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const r = schema.safeParse({
      name: 'Jean',
      email: 'not-an-email',
      subject: 'Question',
      message: 'Un message qui fait plus de vingt caractères.',
    });
    expect(r.success).toBe(false);
  });
});
