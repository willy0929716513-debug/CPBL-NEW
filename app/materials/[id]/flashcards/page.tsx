"use client";

import { ChevronLeft, ChevronRight, Layers, RotateCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, ErrorBanner } from "@/components/ui";
import { callApi } from "@/lib/api-client";
import type { Flashcard } from "@/lib/claude";
import { flashcardsRepo, getMaterial, type Material } from "@/lib/db";
import { cn } from "@/lib/utils";

export default function FlashcardsPage() {
  const { id } = useParams<{ id: string }>();
  const [material, setMaterial] = useState<Material | null>(null);
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMaterial(id).then((m) => setMaterial(m ?? null));
  }, [id]);

  async function generate() {
    if (!material) return;
    setLoading(true);
    setError(null);
    try {
      const { cards } = await callApi<{ cards: Flashcard[] }>("/api/flashcards", {
        context: material.context,
        count: 12,
      });
      setCards(cards);
      setIndex(0);
      setFlipped(false);
      await flashcardsRepo.create(id, cards);
    } catch (err) {
      setError(err instanceof Error ? err.message : "產生學習卡失敗，請再試一次。");
    } finally {
      setLoading(false);
    }
  }

  function go(delta: number) {
    if (!cards) return;
    setFlipped(false);
    setIndex((i) => Math.max(0, Math.min(cards.length - 1, i + delta)));
  }

  if (!material) return <p className="text-sm text-[var(--color-text-secondary)]">載入中...</p>;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex w-full items-center gap-2">
        <Layers className="text-[var(--color-warm)]" size={20} />
        <h1 className="text-xl font-semibold">學習卡</h1>
      </div>

      <Button onClick={generate} loading={loading} className="self-start">
        {cards ? "重新產生一組學習卡" : "產生學習卡"}
      </Button>

      {error && <ErrorBanner message={error} />}

      {cards && cards.length > 0 && (
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            {index + 1} / {cards.length}
          </p>

          <button
            onClick={() => setFlipped((f) => !f)}
            className={cn(
              "card flex h-56 w-full flex-col items-center justify-center gap-3 p-6 text-center transition-colors",
              flipped ? "bg-[var(--color-primary-soft)]" : "bg-[var(--color-surface)]",
            )}
          >
            <p className="text-base font-medium">{flipped ? cards[index].back : cards[index].front}</p>
            <span className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
              <RotateCw size={12} />
              點擊卡片{flipped ? "看正面" : "看答案"}
            </span>
          </button>

          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => go(-1)} disabled={index === 0}>
              <ChevronLeft size={16} />
              上一張
            </Button>
            <Button variant="ghost" onClick={() => go(1)} disabled={index === cards.length - 1}>
              下一張
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
