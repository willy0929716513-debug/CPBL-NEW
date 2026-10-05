"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button, Card, ErrorBanner } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message === "Invalid login credentials" ? "email 或密碼不正確。" : error.message);
      setLoading(false);
      return;
    }
    router.replace(searchParams.get("redirectTo") || "/");
    router.refresh();
  }

  return (
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
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2.5 outline-none focus:border-[var(--color-primary)]"
        />
      </label>
      <Button type="submit" loading={loading}>
        登入
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-5 pt-12">
      <div className="text-center">
        <h1 className="text-xl font-semibold">登入 Pathlight</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">登入後，你的教材與進度會保留在帳號裡。</p>
      </div>

      <Card>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </Card>

      <p className="text-center text-sm text-[var(--color-text-secondary)]">
        還沒有帳號？{" "}
        <Link href="/signup" className="font-medium text-[var(--color-primary)]">
          註冊一個
        </Link>
      </p>
    </div>
  );
}
