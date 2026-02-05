import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = "https://zsmpubvgrthebqvrqaxm.supabase.co";
const supabaseAnonKey = "sb_publishable_rpBS7qLrA1U8X0rx-UvmJg_dIJUrLhZ";

function createSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "Supabase env missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = createSupabaseClient();
