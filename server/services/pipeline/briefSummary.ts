// briefSummary — reduce a *confidential* uploaded brief/PD to neutral search criteria
// (sector, geography, company size, seniority) so raw confidential text never reaches
// the classifier prompt. Used only when the user marks an upload as confidential.

import { callLlmWithFallback, FAST_MODEL } from "../llmClient";
import { briefConfig } from "./briefConfig";

const SUMMARY_INSTRUCTION =
  "Summarize the following job description into a short, neutral list of search criteria " +
  "(sector/industry, geography, company size/revenue, seniority). " +
  "Do not include names, employer, or any confidential details. Reply in 2-4 short lines.";

/**
 * Summarize a confidential PD into neutral criteria. Fails open: on any LLM error it
 * returns "" so the caller falls back to query-only classification rather than throwing.
 */
export async function summarizeConfidentialBrief(pdText: string): Promise<string> {
  const doc = pdText.slice(0, briefConfig.summaryInputCharLimit);
  const messages = [
    { role: "user", content: `${SUMMARY_INSTRUCTION}\n\n<<<DOC\n${doc}\nDOC>>>` },
  ];
  try {
    const out = await callLlmWithFallback(messages, {
      primaryModel: FAST_MODEL,
      fallbackModel: FAST_MODEL,
      temperature: 0,
      maxTokens: briefConfig.summaryMaxTokens,
    });
    return out.trim();
  } catch (err: any) {
    console.warn(`[BriefSummary] Summary failed, classifying without brief context: ${err?.message ?? err}`);
    return "";
  }
}
