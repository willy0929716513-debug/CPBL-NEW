"use client";

import { BookOpenCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { TopicPicker } from "@/components/TopicPicker";
import { Button, Card, ErrorBanner } from "@/components/ui";
import { callApi } from "@/lib/api-client";
import type { Lesson } from "@/lib/claude";
import { getMaterial, lessonRepo, type Material } from "@/lib/db";

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const [material, setMaterial] = useState<Material | null>(null);
  const [topic, setTopic] = useState("");
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMaterial(id).then((m) => {
      setMaterial(m ?? null);
      if (m) setTopic(m.analysis.topics[0] ?? m.analysis.subject);
    });
  }, [id]);

  async function generate() {
    if (!material) return;
    setLoading(true);
    setError(null);
    try {
      const { lesson } = await callApi<{ lesson: Lesson }>("/api/lesson", { topic, context: material.context });
      setLesson(lesson);
      await lessonRepo.create(id, lesson);
    } catch (err) {
      setError(err instanceof Error ? err.message : "產生課程失敗，請再試一次。");
    } finally {
      setLoading(false);
    }
  }

  if (!material) return <p className="text-sm text-[var(--color-text-secondary)]">載入中...</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <BookOpenCheck className="text-[var(--color-primary)]" size={20} />
        <h1 className="text-xl font-semibold">導讀課程</h1>
      </div>

      <TopicPicker topics={material.analysis.topics} selected={topic} onSelect={setTopic} />

      <Button onClick={generate} loading={loading} className="self-start">
        {lesson ? "重新產生這個主題的課程" : "產生導讀課程"}
      </Button>

      {error && <ErrorBanner message={error} />}

      {lesson && (
        <Card className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold">{lesson.title}</h2>
          {lesson.sections.map((section, i) => (
            <div key={i}>
              <h3 className="mb-1.5 font-semibold text-[var(--color-primary)]">{section.heading}</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">
                {section.content}
              </p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
