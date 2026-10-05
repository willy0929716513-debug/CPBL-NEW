"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Card, ErrorBanner } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data.session) {
      // Supabase 專案預設要求 email 驗證——有拿到 user 但沒有 session，
      // 代表要等使用者去信箱點驗證連結才能真的登入。
      setAwaitingConfirmation(true);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  if (awaitingConfirmation) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 pt-12 text-center">
        <h1 className="text-xl font-semibold">請確認你的 email</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          我們寄了一封驗證信到 {email}，點裡面的連結完成驗證後，就可以回來登入了。
        </p>
        <Link href="/login" className="font-medium text-[var(--color-primary)]">
          前往登入
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-5 pt-12">
      <div className="text-center">
        <h1 className="text-xl font-semibold">註冊 Pathlight</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">免費使用，資料會保留在你的帳號裡。</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <ErrorBanner message={error} />}
          <label className="flex flex-col gap-1.5 text-sm">
            Email
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2.5 outline-none focus:border-[var(--color-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            密碼
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2.5 outline-none focus:border-[var(--color-primary)]"
            />
            <span className="text-xs text-[var(--color-text-tertiary)]">至少 6 個字元</span>
          </label>
          <Button type="submit" loading={loading}>
            註冊
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-[var(--color-text-secondary)]">
        已經有帳號？{" "}
        <Link href="/login" className="font-medium text-[var(--color-primary)]">
          登入
        </Link>
      </p>
    </div>
  );
}
