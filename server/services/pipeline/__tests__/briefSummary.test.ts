// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// Mock the LLM client so the summary helper runs without network/keys.
const callLlmWithFallback = vi.fn();
vi.mock('../../llmClient', () => ({
  callLlmWithFallback: (...args: any[]) => callLlmWithFallback(...args),
  FAST_MODEL: 'gemini-2.5-flash',
}));

describe('summarizeConfidentialBrief', () => {
  it('returns the trimmed summary on success', async () => {
    callLlmWithFallback.mockImplementation(() => Promise.resolve('  Sector: pharma\nGeo: UAE  '));
    const { summarizeConfidentialBrief } = await import('../briefSummary');
    expect(await summarizeConfidentialBrief('long confidential JD text')).toBe('Sector: pharma\nGeo: UAE');
  });

  it('fails open (returns "") when the LLM call rejects', async () => {
    callLlmWithFallback.mockImplementation(() => Promise.reject(new Error('quota exceeded')));
    const { summarizeConfidentialBrief } = await import('../briefSummary');
    expect(await summarizeConfidentialBrief('long confidential JD text')).toBe('');
  });

  it('caps the input length sent to the LLM', async () => {
    callLlmWithFallback.mockImplementation(() => Promise.resolve('ok'));
    const { summarizeConfidentialBrief } = await import('../briefSummary');
    const { briefConfig } = await import('../briefConfig');
    await summarizeConfidentialBrief('x'.repeat(briefConfig.summaryInputCharLimit + 1000));
    const sentContent = callLlmWithFallback.mock.calls.at(-1)![0][0].content as string;
    // The DOC block holds at most summaryInputCharLimit chars of the original text.
    const docXs = (sentContent.match(/x/g) || []).length;
    expect(docXs).toBe(briefConfig.summaryInputCharLimit);
  });
});
