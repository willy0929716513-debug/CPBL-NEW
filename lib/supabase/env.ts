function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `沒有設定 ${name} 環境變數。請到 supabase.com 建立一個免費專案，` +
        "把 Project Settings → API 裡的網址跟金鑰填進 .env.local（參考 .env.example）。",
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabasePublishableKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}
