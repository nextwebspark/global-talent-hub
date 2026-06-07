import { supabase } from "./supabase";

// Install a global fetch wrapper that attaches the Supabase Bearer token to
// same-origin /api requests. Centralizes auth so the ~70 existing fetch call
// sites don't each need editing. EventSource is handled separately (it can't
// send headers — see useSearchStream).
let installed = false;

export function installAuthFetch(): void {
  if (installed) return;
  installed = true;

  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    const isApi = url.startsWith("/api") || url.startsWith(`${window.location.origin}/api`);
    if (!isApi) return original(input, init);

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has("Authorization")) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    return original(input, { ...init, headers });
  };
}
