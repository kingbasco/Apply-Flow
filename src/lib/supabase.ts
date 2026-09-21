import { createClient, type SupabaseClient } from '@supabase/supabase-js'

declare const __APPLYFLOW_SUPABASE_URL__: string
declare const __APPLYFLOW_SUPABASE_PUBLISHABLE_KEY__: string

const supabaseUrl = __APPLYFLOW_SUPABASE_URL__
const supabasePublishableKey = __APPLYFLOW_SUPABASE_PUBLISHABLE_KEY__

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
