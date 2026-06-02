import { describe, it, expect } from 'vitest';
import { parseJsonSafe } from '../queryIntent';

describe('parseJsonSafe', () => {
  it('parses plain JSON', () => {
    expect(parseJsonSafe('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON inside ```json fences', () => {
    const fenced = '```json\n{"name":"Acme","sector":"FMCG"}\n```';
    expect(parseJsonSafe(fenced)).toEqual({ name: 'Acme', sector: 'FMCG' });
  });

  it('parses JSON inside bare ``` fences', () => {
    expect(parseJsonSafe('```\n{"x":42}\n```')).toEqual({ x: 42 });
  });

  it('extracts first {...} block when surrounded by prose', () => {
    const noisy = 'Here you go:\n{"countries":["UAE"]}\nLet me know if you need more.';
    expect(parseJsonSafe(noisy)).toEqual({ countries: ['UAE'] });
  });

  it('returns null on unparseable garbage', () => {
    expect(parseJsonSafe('no braces here at all')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseJsonSafe('{"a": 1, "b":}')).toBeNull();
  });
});
