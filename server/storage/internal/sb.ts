import { keysToCamel } from "./case";

export function nowIso() {
  return new Date().toISOString();
}

// Throws if error, returns camelCase-converted data
export function sb<T>(result: { data: T | null; error: any }, ctx: string): T {
  if (result.error) throw new Error(`[Storage:${ctx}] ${result.error.message}`);
  if (result.data === null) throw new Error(`[Storage:${ctx}] No data returned`);
  return keysToCamel<T>(result.data);
}

// Like sb but returns undefined instead of throwing when data is null
export function sbOpt<T>(result: { data: T | null; error: any }, ctx: string): T | undefined {
  if (result.error) throw new Error(`[Storage:${ctx}] ${result.error.message}`);
  return result.data ? keysToCamel<T>(result.data) : undefined;
}
