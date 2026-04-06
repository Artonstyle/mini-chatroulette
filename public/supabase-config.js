window.MINI_CHATROULETTE_SUPABASE_URL = "https://zwiasfpcqfvrzaoqpaky.supabase.co";
window.MINI_CHATROULETTE_SUPABASE_ANON_KEY = "sb_publishable_wmBkxyoqQk8ySg6K2tQ7pw_3tkYS7Pw";

window.getMiniChatrouletteSupabaseClient = function getMiniChatrouletteSupabaseClient() {
  if (window.MINI_CHATROULETTE_SUPABASE_CLIENT) {
    return window.MINI_CHATROULETTE_SUPABASE_CLIENT;
  }

  if (!window.supabase || !window.MINI_CHATROULETTE_SUPABASE_URL || !window.MINI_CHATROULETTE_SUPABASE_ANON_KEY) {
    return null;
  }

  window.MINI_CHATROULETTE_SUPABASE_CLIENT = window.supabase.createClient(
    window.MINI_CHATROULETTE_SUPABASE_URL,
    window.MINI_CHATROULETTE_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage
      }
    }
  );

  return window.MINI_CHATROULETTE_SUPABASE_CLIENT;
};
