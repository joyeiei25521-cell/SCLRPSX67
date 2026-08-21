/*
 * Supabase configuration for the Student Council website.
 *
 * IMPORTANT:
 * - Use the Project URL and Publishable Key from Supabase.
 * - NEVER put the service_role/secret key in this file or in browser code.
 */
window.SUPABASE_URL = 'https://bgzmfmxcoimmmorlwyiq.supabase.co';
window.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_RoG44n0YduUs0lwJEFmbBA_A7hOszME';

if (
  window.supabase &&
  window.SUPABASE_URL &&
  window.SUPABASE_PUBLISHABLE_KEY &&
  !window.SUPABASE_URL.includes('PASTE_') &&
  !window.SUPABASE_PUBLISHABLE_KEY.includes('PASTE_')
) {
  window.schoolSupabase = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
} else {
  window.schoolSupabase = null;
  console.warn('Supabase is not configured. Add the Project URL and Publishable Key to supabase-config.js.');
}
