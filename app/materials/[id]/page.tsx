"use client";

import {
  BookOpenCheck,
  CheckCircle2,
  Circle,
  ClipboardList,
  Headphones,
  Layers,
  Mic,
  NotebookPen,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui";
import { getMaterial, getProgress, toggleStepComplete, type Material } from "@/lib/db";

const FEATURES = [
  { href: "lesson", label: "導讀課程", icon: BookOpenCheck, color: "#6d5ef0" },
  { href: "podcast", label: "主題 Podcast", icon: Headphones, color: "#15b89a" },
  { href: "flashcards", label: "學習卡", icon: Layers, color: "#f5a524" },
  { href: "quiz", label: "互動小測驗", icon: ClipboardList, color: "#ef5da8" },
  { href: "exam/written", label: "模擬筆試", icon: NotebookPen, color: "#3b82f6" },
  { href: "exam/oral", label: "模擬口試", icon: Mic, color: "#e4572e" },
];

export default function MaterialPage() {
  const { id } = useParams<{ id: string }>();
  const [material, setMaterial] = useState<Material | null | undefined>(undefined);
  const [completed, setCompleted] = useState<number[]>([]);

  useEffect(() => {
    getMaterial(id).then(setMaterial);
    getProgress(id).then(setCompleted);
  }, [id]);

  async function toggleStep(day: number) {
    const updated = await toggleStepComplete(id, day);
    setCompleted(updated);
  }

  if (material === undefined) {
    return <p className="text-sm text-[var(--color-text-secondary)]">載入中...</p>;
  }
  if (material === null) {
    return <p className="text-sm text-[var(--color-text-secondary)]">找不到這份教材。</p>;
  }

  const { analysis } = material;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-[var(--color-primary)]">{analysis.subject}</p>
        <h1 className="text-xl font-semibold">{material.fileName}</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{analysis.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {analysis.topics.map((topic) => (
            <span
              key={topic}
              className="rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-medium text-[var(--color-primary)]"
            >
              {topic}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-secondary)]">學習功能</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {FEATURES.map(({ href, label, icon: Icon, color }) => (
            <Link key={href} href={`/materials/${id}/${href}`}>
              <Card className="flex h-full flex-col gap-2 transition-transform hover:-translate-y-0.5">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
                  style={{ background: color }}
                >
                  <Icon size={18} />
                </span>
                <span className="text-sm font-semibold">{label}</span>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text-secondary)]">
          個人化讀書計畫（{completed.length}/{analysis.studyPlan.length}）
        </h2>
        <Card className="flex flex-col divide-y divide-[var(--color-border)] p-0">
          {analysis.studyPlan.map((step) => {
            const done = completed.includes(step.day);
            return (
              <button
                key={step.day}
                onClick={() => toggleStep(step.day)}
                className="flex items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-black/[0.02]"
              >
                {done ? (
                  <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
                ) : (
                  <Circle size={20} className="mt-0.5 shrink-0 text-[var(--color-text-tertiary)]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={done ? "font-medium line-through opacity-50" : "font-medium"}>
                    Day {step.day}・{step.title}
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{step.description}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">約 {step.estimatedMinutes} 分鐘</p>
                </div>
              </button>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
