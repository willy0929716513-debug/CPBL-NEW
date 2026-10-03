"use client";

import { NotebookPen } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, Card, ErrorBanner } from "@/components/ui";
import { callApi } from "@/lib/api-client";
import type { GradedExam } from "@/lib/claude";
import { getMaterial, writtenExamRepo, type Material, type WrittenExamAttempt } from "@/lib/db";

export default function WrittenExamPage() {
  const { id } = useParams<{ id: string }>();
  const [material, setMaterial] = useState<Material | null>(null);
  const [attempt, setAttempt] = useState<WrittenExamAttempt | null>(null);
  const [generating, setGenerating] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMaterial(id).then((m) => setMaterial(m ?? null));
  }, [id]);

  async function generate() {
    if (!material) return;
    setGenerating(true);
    setError(null);
    try {
      const { exam } = await callApi<{ exam: { title: string; questions: { question: string; points: number }[] } }>(
        "/api/exam/written",
        { context: material.context },
      );
      const created = await writtenExamRepo.create(id, exam);
      setAttempt(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "命題失敗，請再試一次。");
    } finally {
      setGenerating(false);
    }
  }

  function updateAnswer(index: number, value: string) {
    if (!attempt) return;
    const answers = [...attempt.answers];
    answers[index] = value;
    setAttempt({ ...attempt, answers });
  }

  async function submit() {
    if (!attempt) return;
    setGrading(true);
    setError(null);
    try {
      const { graded } = await callApi<{ graded: GradedExam }>("/api/exam/written/grade", {
        questions: attempt.exam.questions,
        answers: attempt.answers,
      });
      const updated = { ...attempt, graded };
      setAttempt(updated);
      await writtenExamRepo.update(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批改失敗，請再試一次。");
    } finally {
      setGrading(false);
    }
  }

  if (!material) return <p className="text-sm text-[var(--color-text-secondary)]">載入中...</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <NotebookPen className="text-blue-500" size={20} />
        <h1 className="text-xl font-semibold">模擬筆試</h1>
      </div>

      <Button onClick={generate} loading={generating} className="self-start">
        {attempt ? "重新命題一份考卷" : "開始模擬筆試"}
      </Button>

      {error && <ErrorBanner message={error} />}

      {attempt && (
        <>
          <h2 className="text-lg font-semibold">{attempt.exam.title}</h2>

          {attempt.graded && (
            <Card className="bg-[var(--color-primary-soft)] text-center">
              <p className="text-lg font-semibold text-[var(--color-primary)]">
                總分：{attempt.graded.totalScore} / {attempt.graded.totalMax}
              </p>
            </Card>
          )}

          <div className="flex flex-col gap-4">
            {attempt.exam.questions.map((q, i) => {
              const result = attempt.graded?.results[i];
              return (
                <Card key={i} className="flex flex-col gap-2">
                  <p className="font-medium">
                    {i + 1}. {q.question}
                    <span className="ml-2 text-xs font-normal text-[var(--color-text-tertiary)]">
                      （{q.points} 分）
                    </span>
                  </p>
                  <textarea
                    value={attempt.answers[i]}
                    onChange={(e) => updateAnswer(i, e.target.value)}
                    disabled={!!attempt.graded}
                    rows={4}
                    placeholder="在這裡作答..."
                    className="rounded-xl border border-[var(--color-border)] bg-transparent p-3 text-sm outline-none focus:border-[var(--color-primary)] disabled:opacity-70"
                  />
                  {result && (
                    <div className="rounded-xl bg-black/[0.02] p-3 text-sm">
                      <p className="font-semibold text-[var(--color-primary)]">
                        得分：{result.score} / {result.maxScore}
                      </p>
                      <p className="mt-1 text-[var(--color-text-secondary)]">{result.feedback}</p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {!attempt.graded && (
            <Button onClick={submit} loading={grading} className="self-end">
              送出批改
            </Button>
          )}
        </>
      )}
    </div>
  );
}
