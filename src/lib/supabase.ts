import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const env = import.meta.env as Record<string, string | undefined>

const supabaseUrl =
  env.VITE_SUPABASE_URL ??
  env.SUPABASE_URL ??
  env.NEXT_PUBLIC_SUPABASE_URL ??
  ''

const supabasePublishableKey =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  env.SUPABASE_PUBLISHABLE_KEY ??
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  env.SUPABASE_ANON_KEY ??
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ''

const missingConfigMessage =
  'Supabase is not configured for this deployment. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the Vercel project environment variables.'

export const supabase: SupabaseClient = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : new Proxy({} as SupabaseClient, {
      get() {
        throw new Error(missingConfigMessage)
      },
    })
