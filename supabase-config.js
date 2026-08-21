/*
 * Supabase configuration for the Student Council website.
 *
 * IMPORTANT:
 * - Use the Project URL and Publishable Key from Supabase.
 * - NEVER put the service_role/secret key in this file or in browser code.
 */
window.SUPABASE_URL = 'PASTE_YOUR_SUPABASE_PROJECT_URL_HERE';
window.SUPABASE_PUBLISHABLE_KEY = 'PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE';

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
