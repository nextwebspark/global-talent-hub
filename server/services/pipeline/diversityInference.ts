import { callLlmWithFallback, DEFAULT_MODEL, FAST_MODEL } from "../llmClient";
import { storage } from "../../storage";
import { parseJsonSafe, parseJsonArraySafe } from './utils';

function callLlm(messages: Array<{ role: string; content: string }>): Promise<string> {
  return callLlmWithFallback(messages as any, { primaryModel: DEFAULT_MODEL, fallbackModel: FAST_MODEL, maxTokens: 2000 });
}

export async function inferDiversityForExecutive(executiveId: number): Promise<boolean> {
  try {
    const exec = await storage.getExecutive(executiveId);
    if (!exec) return false;

    const manualFields = exec.manuallyEditedFields || [];
    const genderManual = manualFields.includes('gender');
    const ethnicityManual = manualFields.includes('ethnicity');

    if ((exec.gender && !genderManual) && (exec.ethnicity && !ethnicityManual)) {
      return false;
    }
    if (genderManual && ethnicityManual) {
      return false;
    }

    const needGender = !exec.gender && !genderManual;
    const needEthnicity = !exec.ethnicity && !ethnicityManual;

    if (!needGender && !needEthnicity) return false;

    const company = await storage.getCompany(exec.companyId);
    const companyName = company?.name || 'Unknown';
    const country = company?.country || '';

    const prompt = `Given the following executive information, infer their gender and ethnicity.

Name: ${exec.name}
Title: ${exec.title || 'Unknown'}
Company: ${companyName}
Country: ${country}

RULES:
- Gender options: "Male", "Female"
- Ethnicity: MUST be one of these exact values: "African", "East Asian", "European", "Latin American", "Middle Eastern", "Native/Indigenous", "Pacific Islander", "South Asian", "Southeast Asian", "Mixed/Other"
- ONLY provide a value if you are highly confident (8/10 or above)
- If the name is ambiguous (e.g., "John Smith" could be many ethnicities), return null for ethnicity
- Consider the full context: name origin, company location, career history
- Be conservative — it is better to return null than guess incorrectly

Return JSON only:
{
  "gender": "Male" | "Female" | "Non-Binary" | null,
  "genderConfidence": number (1-10) | null,
  "ethnicity": "Ethnicity Category" | null,
  "ethnicityConfidence": number (1-10) | null
}`;

    const response = await callLlm([{ role: "user", content: prompt }]);
    const parsed = parseJsonSafe(response);

    if (!parsed) return false;

    const updates: Record<string, any> = {};

    if (needGender && parsed.gender && typeof parsed.genderConfidence === 'number' && parsed.genderConfidence >= 8) {
      updates.gender = parsed.gender;
      updates.genderConfidence = parsed.genderConfidence;
    }

    if (needEthnicity && parsed.ethnicity && typeof parsed.ethnicityConfidence === 'number' && parsed.ethnicityConfidence >= 8) {
      updates.ethnicity = parsed.ethnicity;
      updates.ethnicityConfidence = parsed.ethnicityConfidence;
    }

    if (Object.keys(updates).length > 0) {
      await storage.enrichExecutiveEmptyFields(executiveId, updates);
      console.log(`[DiversityInference] Updated executive ${exec.name} (${executiveId}):`, Object.keys(updates).join(', '));
      return true;
    }

    return false;
  } catch (error) {
    console.error(`[DiversityInference] Error inferring diversity for executive ${executiveId}:`, error);
    return false;
  }
}

export async function inferDiversityBatch(executiveIds: number[]): Promise<{ updated: number; total: number }> {
  if (executiveIds.length === 0) return { updated: 0, total: 0 };

  const executives = [];
  for (const id of executiveIds) {
    const exec = await storage.getExecutive(id);
    if (!exec) continue;
    const manualFields = exec.manuallyEditedFields || [];
    const needGender = !exec.gender && !manualFields.includes('gender');
    const needEthnicity = !exec.ethnicity && !manualFields.includes('ethnicity');
    if (needGender || needEthnicity) {
      const company = await storage.getCompany(exec.companyId);
      executives.push({
        id: exec.id,
        name: exec.name,
        title: exec.title || 'Unknown',
        company: company?.name || 'Unknown',
        country: company?.country || '',
        needGender,
        needEthnicity,
      });
    }
  }

  if (executives.length === 0) return { updated: 0, total: 0 };

  let updated = 0;
  const BATCH_SIZE = 10;

  for (let i = 0; i < executives.length; i += BATCH_SIZE) {
    const batch = executives.slice(i, i + BATCH_SIZE);

    const execList = batch.map((e, idx) => 
      `${idx + 1}. Name: "${e.name}", Title: "${e.title}", Company: "${e.company}", Country: "${e.country}"`
    ).join('\n');

    const prompt = `For each executive below, infer their gender and ethnicity.

${execList}

RULES:
- Gender options: "Male", "Female"
- Ethnicity: MUST be one of these exact values: "African", "East Asian", "European", "Latin American", "Middle Eastern", "Native/Indigenous", "Pacific Islander", "South Asian", "Southeast Asian", "Mixed/Other"
- ONLY provide a value if you are highly confident (8/10 or above)
- If a name is ambiguous for ethnicity (e.g., "John Smith"), return null for ethnicity
- Consider full context: name origin, company location, career history
- Be conservative — better to return null than guess incorrectly

Return a JSON array with one object per executive, in the same order:
[
  {
    "gender": "Male" | "Female" | "Non-Binary" | null,
    "genderConfidence": number (1-10) | null,
    "ethnicity": "Ethnicity Category" | null,
    "ethnicityConfidence": number (1-10) | null
  },
  ...
]`;

    try {
      const response = await callLlm([{ role: "user", content: prompt }]);
      const results = parseJsonArraySafe(response);

      if (Array.isArray(results) && results.length === batch.length) {
        for (let j = 0; j < batch.length; j++) {
          const exec = batch[j];
          const result = results[j];
          if (!result) continue;

          const updates: Record<string, any> = {};

          if (exec.needGender && result.gender && typeof result.genderConfidence === 'number' && result.genderConfidence >= 8) {
            updates.gender = result.gender;
            updates.genderConfidence = result.genderConfidence;
          }

          if (exec.needEthnicity && result.ethnicity && typeof result.ethnicityConfidence === 'number' && result.ethnicityConfidence >= 8) {
            updates.ethnicity = result.ethnicity;
            updates.ethnicityConfidence = result.ethnicityConfidence;
          }

          if (Object.keys(updates).length > 0) {
            await storage.enrichExecutiveEmptyFields(exec.id, updates);
            console.log(`[DiversityInference] Batch updated: ${exec.name} (${exec.id})`);
            updated++;
          }
        }
      } else {
        for (const exec of batch) {
          const success = await inferDiversityForExecutive(exec.id);
          if (success) updated++;
        }
      }
    } catch (error) {
      console.error(`[DiversityInference] Batch error, falling back to individual:`, error);
      for (const exec of batch) {
        try {
          const success = await inferDiversityForExecutive(exec.id);
          if (success) updated++;
        } catch (e) {
          console.error(`[DiversityInference] Individual inference failed for ${exec.name}:`, e);
        }
      }
    }
  }

  console.log(`[DiversityInference] Batch complete: ${updated}/${executives.length} updated`);
  return { updated, total: executives.length };
}

export async function inferDiversityForSearch(searchQueryId: number): Promise<{ updated: number; total: number }> {
  try {
    const companies = await storage.getCompaniesBySearchQuery(searchQueryId);
    const allExecIds: number[] = [];

    for (const company of companies) {
      const executives = await storage.getExecutivesByCompany(company.id);
      for (const exec of executives) {
        const manualFields = exec.manuallyEditedFields || [];
        const needGender = !exec.gender && !manualFields.includes('gender');
        const needEthnicity = !exec.ethnicity && !manualFields.includes('ethnicity');
        if (needGender || needEthnicity) {
          allExecIds.push(exec.id);
        }
      }
    }

    if (allExecIds.length === 0) {
      console.log(`[DiversityInference] No executives need diversity data for search ${searchQueryId}`);
      return { updated: 0, total: 0 };
    }

    console.log(`[DiversityInference] Starting inference for ${allExecIds.length} executives in search ${searchQueryId}`);
    return await inferDiversityBatch(allExecIds);
  } catch (error) {
    console.error(`[DiversityInference] Error in search-level inference:`, error);
    return { updated: 0, total: 0 };
  }
}
