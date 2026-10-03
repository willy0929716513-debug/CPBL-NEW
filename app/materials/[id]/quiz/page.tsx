"use client";

import { Check, ClipboardList, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, Card, ErrorBanner } from "@/components/ui";
import { callApi } from "@/lib/api-client";
import type { QuizQuestion } from "@/lib/claude";
import { getMaterial, quizRepo, type Material, type QuizAttempt } from "@/lib/db";
import { cn } from "@/lib/utils";

export default function QuizPage() {
  const { id } = useParams<{ id: string }>();
  const [material, setMaterial] = useState<Material | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
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
      const { questions } = await callApi<{ questions: QuizQuestion[] }>("/api/quiz", {
        context: material.context,
        count: 8,
      });
      const created = await quizRepo.create(id, questions);
      setAttempt(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "出題失敗，請再試一次。");
    } finally {
      setLoading(false);
    }
  }

  async function answer(questionIndex: number, choiceIndex: number) {
    if (!attempt) return;
    const updated = await quizRepo.answerQuestion(attempt, questionIndex, choiceIndex);
    setAttempt(updated);
  }

  if (!material) return <p className="text-sm text-[var(--color-text-secondary)]">載入中...</p>;

  const score = attempt
    ? attempt.questions.filter((q, i) => attempt.answers[i] === q.correctIndex).length
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <ClipboardList className="text-[var(--color-warm)]" size={20} />
        <h1 className="text-xl font-semibold">互動小測驗</h1>
      </div>

      <Button onClick={generate} loading={loading} className="self-start">
        {attempt ? "重新出一份測驗" : "開始測驗"}
      </Button>

      {error && <ErrorBanner message={error} />}

      {attempt && (
        <>
          {attempt.completedAt && (
            <Card className="bg-[var(--color-primary-soft)] text-center">
              <p className="text-lg font-semibold text-[var(--color-primary)]">
                得分：{score} / {attempt.questions.length}
              </p>
            </Card>
          )}

          <div className="flex flex-col gap-4">
            {attempt.questions.map((q, qi) => {
              const userAnswer = attempt.answers[qi];
              return (
                <Card key={qi} className="flex flex-col gap-3">
                  <p className="font-medium">
                    {qi + 1}. {q.question}
                  </p>
                  <div className="flex flex-col gap-2">
                    {q.choices.map((choice, ci) => {
                      const isSelected = userAnswer === ci;
                      const isCorrect = ci === q.correctIndex;
                      const revealed = userAnswer !== null;
                      return (
                        <button
                          key={ci}
                          onClick={() => answer(qi, ci)}
                          disabled={revealed}
                          className={cn(
                            "flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors",
                            !revealed && "border-[var(--color-border)] hover:border-[var(--color-primary)]",
                            revealed && isCorrect && "border-[var(--color-accent)] bg-emerald-50",
                            revealed && isSelected && !isCorrect && "border-red-300 bg-red-50",
                            revealed && !isSelected && !isCorrect && "border-[var(--color-border)] opacity-60",
                          )}
                        >
                          <span>{choice}</span>
                          {revealed && isCorrect && <Check size={16} className="text-[var(--color-accent)]" />}
                          {revealed && isSelected && !isCorrect && <X size={16} className="text-red-500" />}
                        </button>
                      );
                    })}
                  </div>
                  {userAnswer !== null && (
                    <p className="text-sm text-[var(--color-text-secondary)]">{q.explanation}</p>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
