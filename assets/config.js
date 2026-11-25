/* Giveaway Pulse — public front-end config.
 * Everything here is visible to visitors, so only PUBLIC keys go here:
 *  - youtubeApiKey: browser key restricted to this site (HTTP referrer) + YouTube Data API only
 *  - supabaseAnonKey: Supabase "anon public" key (safe; access is controlled by RLS)
 * NEVER put the Supabase service_role key or a database password here.
 */
window.GP_CONFIG = {
  youtubeApiKey: "AIzaSyCe5gqt-f2Md8vskhfZY4Bo9eY5MbfGShU",
  supabaseUrl: "https://gnetqwovpgikjtmybuhd.supabase.co",
  supabaseAnonKey: "sb_publishable__JozPK-kEQL7a6EpSIYHKA_RcYfPV2R"  // publishable (public) key
};
