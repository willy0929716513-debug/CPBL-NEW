"use client";

import { Mic, Square, Volume2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button, Card, ErrorBanner } from "@/components/ui";
import { callApi } from "@/lib/api-client";
import type { OralGrade } from "@/lib/claude";
import { getMaterial, oralSessionRepo, type Material, type OralSession } from "@/lib/db";
import { createRecognizer, isSpeechRecognitionSupported, speak, type Recognizer } from "@/lib/speech";

export default function OralExamPage() {
  const { id } = useParams<{ id: string }>();
  const [material, setMaterial] = useState<Material | null>(null);
  const [session, setSession] = useState<OralSession | null>(null);
  const [current, setCurrent] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [grading, setGrading] = useState(false);
  const [manualAnswer, setManualAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognizerRef = useRef<Recognizer | null>(null);

  useEffect(() => {
    getMaterial(id).then((m) => setMaterial(m ?? null));
  }, [id]);

  async function generate() {
    if (!material) return;
    setGenerating(true);
    setError(null);
    try {
      const { questions } = await callApi<{ questions: string[] }>("/api/exam/oral/questions", {
        context: material.context,
        count: 5,
      });
      const created = await oralSessionRepo.create(id, questions);
      setSession(created);
      setCurrent(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "出題失敗，請再試一次。");
    } finally {
      setGenerating(false);
    }
  }

  async function submitTranscript(transcript: string) {
    if (!session || !material) return;
    setGrading(true);
    setError(null);
    try {
      const question = session.questions[current];
      const { grade } = await callApi<{ grade: OralGrade }>("/api/exam/oral/grade", {
        context: material.context,
        question,
        transcript,
      });
      const updated: OralSession = {
        ...session,
        results: [...session.results, { question, transcript, grade }],
      };
      setSession(updated);
      await oralSessionRepo.update(updated);
      setManualAnswer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "評分失敗，請再試一次。");
    } finally {
      setGrading(false);
    }
  }

  function startRecording() {
    if (!isSpeechRecognitionSupported()) return;
    setError(null);
    const recognizer = createRecognizer(
      (transcript) => submitTranscript(transcript),
      () => setRecording(false),
    );
    if (!recognizer) return;
    recognizerRef.current = recognizer;
    setRecording(true);
    recognizer.start();
  }

  function stopRecording() {
    recognizerRef.current?.stop();
    setRecording(false);
  }

  if (!material) return <p className="text-sm text-[var(--color-text-secondary)]">載入中...</p>;

  const result = session?.results[current];
  const isLastQuestion = session ? current === session.questions.length - 1 : false;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Mic className="text-orange-500" size={20} />
        <h1 className="text-xl font-semibold">模擬口試</h1>
      </div>

      <Button onClick={generate} loading={generating} className="self-start">
        {session ? "重新開始一次口試" : "開始模擬口試"}
      </Button>

      {error && <ErrorBanner message={error} />}

      {session && (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-tertiary)]">
              第 {current + 1} / {session.questions.length} 題
            </p>
            <button
              onClick={() => speak(session.questions[current])}
              className="flex items-center gap-1 text-sm text-[var(--color-primary)]"
            >
              <Volume2 size={14} />
              朗讀題目
            </button>
          </div>

          <p className="text-base font-medium">{session.questions[current]}</p>

          {!result && (
            <>
              {isSpeechRecognitionSupported() ? (
                <Button
                  onClick={recording ? stopRecording : startRecording}
                  loading={grading}
                  variant={recording ? "secondary" : "primary"}
                  className="self-start"
                >
                  {recording ? <Square size={16} /> : <Mic size={16} />}
                  {recording ? "停止並送出" : "開始回答"}
                </Button>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    這個瀏覽器不支援語音辨識，改用文字輸入回答。
                  </p>
                  <textarea
                    value={manualAnswer}
                    onChange={(e) => setManualAnswer(e.target.value)}
                    rows={3}
                    className="rounded-xl border border-[var(--color-border)] bg-transparent p-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                  <Button
                    onClick={() => submitTranscript(manualAnswer)}
                    loading={grading}
                    disabled={!manualAnswer.trim()}
                    className="self-start"
                  >
                    提交回答
                  </Button>
                </div>
              )}
            </>
          )}

          {result && (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl bg-black/[0.02] p-3 text-sm text-[var(--color-text-secondary)]">
                你的回答：{result.transcript}
              </div>
              <div className="rounded-xl bg-[var(--color-primary-soft)] p-3 text-sm">
                <p className="font-semibold text-[var(--color-primary)]">評分：{result.grade.score} / 10</p>
                <p className="mt-1">{result.grade.feedback}</p>
                <p className="mt-2 text-[var(--color-text-secondary)]">
                  <span className="font-medium">示範回答：</span>
                  {result.grade.modelAnswer}
                </p>
              </div>
              {!isLastQuestion && (
                <Button onClick={() => setCurrent((c) => c + 1)} className="self-end">
                  下一題
                </Button>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
