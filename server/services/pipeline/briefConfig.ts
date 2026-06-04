// briefConfig — tunables for feeding an uploaded brief/PD into the company-universe
// classifier. Centralised here (env-overridable) so caps and limits are not buried
// as magic numbers across the pipeline.

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const briefConfig = {
  /** Max chars of extracted PD text sent to the classifier (non-confidential path). */
  classifierCharLimit: intFromEnv("BRIEF_CLASSIFIER_CHAR_LIMIT", 4000),
  /** Max chars of PD text fed to the confidential-summary call. */
  summaryInputCharLimit: intFromEnv("BRIEF_SUMMARY_INPUT_CHAR_LIMIT", 8000),
  /** Max output tokens for the confidential-summary call. */
  summaryMaxTokens: intFromEnv("BRIEF_SUMMARY_MAX_TOKENS", 300),
} as const;
