"use client";

import { Camera, GraduationCap, LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "我的教材" },
  { href: "/solve", label: "拍照解題", icon: Camera },
];

const AUTH_PATHS = ["/login", "/signup"];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getClaims().then(({ data }) => setEmail((data?.claims.email as string) ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (AUTH_PATHS.includes(pathname)) {
    return (
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
              <GraduationCap size={18} />
            </span>
            Pathlight
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-bg)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-[var(--color-text)]">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
            <GraduationCap size={18} />
          </span>
          Pathlight
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                    : "text-[var(--color-text-secondary)] hover:bg-black/[0.03]",
                )}
              >
                {Icon && <Icon size={16} />}
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
          <Link
            href="/upload"
            className="ml-1 flex items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">新增教材</span>
          </Link>
          {email && (
            <button
              onClick={handleLogout}
              title={email}
              className="ml-1 flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-black/[0.03]"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">登出</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
