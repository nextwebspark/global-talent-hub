// ─── camelCase ↔ snake_case helpers ──────────────────────────────────────────

export function toCamelKey(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
export function toSnakeKey(s: string): string {
  return s.replace(/([A-Z])/g, "_$1").toLowerCase();
}

export function keysToCamel<T>(obj: any): T {
  if (Array.isArray(obj)) return obj.map(keysToCamel) as any;
  if (obj && typeof obj === "object" && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamelKey(k), keysToCamel(v)])
    ) as T;
  }
  return obj;
}

export function keysToSnake(obj: any): any {
  if (Array.isArray(obj)) return obj.map(keysToSnake);
  if (obj && typeof obj === "object" && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => {
        // Don't snake_case keys inside JSONB fields stored as plain objects
        const snakeK = toSnakeKey(k);
        // Recurse only for non-JSONB-looking values (primitives, arrays of primitives)
        return [snakeK, keysToSnake(v)];
      })
    );
  }
  return obj;
}
