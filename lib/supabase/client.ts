"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublishableKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * 瀏覽器端的 Supabase client。session 存在 cookie 裡（不是 localStorage），
 * 這樣伺服器端（middleware、Server Component）才能讀到同一份登入狀態。
 * 「記住我」預設就是開著的——Supabase 的 refresh token 本來就是長效的，
 * 關掉瀏覽器再打開通常還是登入狀態；真正「不要記住我」的做法是登出，
 * 這個 app 沒有做「只記這次瀏覽」的選項，因為那需要額外的 session 管理，
 * 對一個免費、單人使用的學習工具來說不划算。
 */
export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabasePublishableKey());
}
