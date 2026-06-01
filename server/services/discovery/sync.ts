import { DEFAULT_MODEL } from "./models";
import { SearchCriteria } from "./queryParser";
import { discoverCompaniesStreaming } from "./streaming";

export async function discoverCompaniesAndExecutives(
  criteria: SearchCriteria,
  searchQueryId: number,
  selectedModel: string = DEFAULT_MODEL,
  originalQuery: string
): Promise<any[]> {
  if (!originalQuery || originalQuery.trim().length === 0) {
    throw new Error('Original query is required for accurate search results');
  }
  const results: any[] = [];

  for await (const event of discoverCompaniesStreaming(criteria, searchQueryId, selectedModel, originalQuery)) {
    if (event.type === 'company') {
      results.push(event.data.company);
    } else if (event.type === 'error') {
      // Include suggestion in error message for user-facing display
      const errorMessage = event.data.suggestion
        ? `${event.data.message} ${event.data.suggestion}`
        : event.data.message;
      const error = new Error(errorMessage);
      (error as any).code = event.data.code;
      (error as any).suggestion = event.data.suggestion;
      throw error;
    }
  }

  return results;
}
