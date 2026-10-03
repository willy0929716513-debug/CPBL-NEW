"use client";

import { Camera, GraduationCap, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "我的教材" },
  { href: "/solve", label: "拍照解題", icon: Camera },
];

export function Nav() {
  const pathname = usePathname();

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
        </nav>
      </div>
    </header>
  );
}
