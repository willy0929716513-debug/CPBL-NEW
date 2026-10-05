import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublishableKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * 伺服器端（Server Component、Route Handler）用的 Supabase client，讀寫
 * cookie 裡的 session。Server Component 裡沒辦法真的寫 cookie（Next.js
 * 的限制），所以這裡的 setAll 包了 try/catch——只要 middleware.ts 有正常
 * 運作、session 的刷新還是會成功寫回去，這裡失敗也不影響當次請求的讀取。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 在 Server Component 裡呼叫會失敗，交給 middleware 處理即可。
        }
      },
    },
  });
}
