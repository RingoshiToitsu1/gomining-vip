/* GMT Optimizer — Supabase connection config.
   =============================================
   Both values are SAFE to ship publicly: the anon key only works through the
   Row-Level-Security policies in supabase/schema.sql. Fill these from your
   Supabase dashboard: Settings -> API -> "Project URL" and "anon public" key.
   Until they're set to real values, account features stay disabled and the
   console works exactly as before. */
window.GMT_SUPABASE = {
  url:     'PASTE_PROJECT_URL_HERE',      // e.g. https://abcdefgh.supabase.co
  anonKey: 'PASTE_ANON_PUBLIC_KEY_HERE'   // the long "anon public" JWT
};
