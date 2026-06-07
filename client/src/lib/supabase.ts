import { createClient } from "@supabase/supabase-js";

// Browser client uses the public anon key + VITE_-prefixed env vars (Vite only
// exposes VITE_* to the client). The server keeps its own SUPABASE_KEY.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set");
}

export const supabase = createClient(url, anonKey);

// Current access token (or undefined if signed out). Used to authorize API calls.
export async function getAccessToken(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}
