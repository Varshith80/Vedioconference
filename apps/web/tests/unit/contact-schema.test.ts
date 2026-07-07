import { describe, it, expect } from 'vitest';
import { contactSchema } from '@/lib/validations/contact';

describe('contactSchema', () => {
  it('accepts a valid payload', () => {
    const r = contactSchema.safeParse({
      name: 'Jean Dupont',
      email: 'jean@example.com',
      subject: 'Question sur les tarifs',
      message: 'Bonjour, je souhaite en savoir plus sur vos formules pour la terminale.',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an empty honeypot is fine, but a non-empty honeypot is rejected', () => {
    const r = contactSchema.safeParse({
      name: 'Jean Dupont',
      email: 'jean@example.com',
      subject: 'Question',
      message: 'Bonjour, je souhaite en savoir plus sur vos formules.',
      website: 'http://spam.example.com',
    });
    expect(r.success).toBe(false);
  });

  it('rejects a too-short message', () => {
    const r = contactSchema.safeParse({
      name: 'Jean',
      email: 'jean@example.com',
      subject: 'Question',
      message: 'trop court',
    });
    expect(r.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    const r = contactSchema.safeParse({
      name: 'Jean',
      email: 'not-an-email',
      subject: 'Question',
      message: 'Un message qui fait plus de vingt caractères.',
    });
    expect(r.success).toBe(false);
  });
});
