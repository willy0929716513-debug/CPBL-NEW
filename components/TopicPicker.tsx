"use client";

import { cn } from "@/lib/utils";

/** 讓使用者從教材分析出的主題裡選一個，當作這次要產生內容的焦點。 */
export function TopicPicker({
  topics,
  selected,
  onSelect,
}: {
  topics: string[];
  selected: string;
  onSelect: (topic: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {topics.map((topic) => (
        <button
          key={topic}
          onClick={() => onSelect(topic)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
            topic === selected
              ? "bg-[var(--color-primary)] text-white"
              : "bg-[var(--color-primary-soft)] text-[var(--color-primary)] hover:opacity-80",
          )}
        >
          {topic}
        </button>
      ))}
    </div>
  );
}
