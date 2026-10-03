"use client";

import { Camera, Upload } from "lucide-react";
import { useState } from "react";

import { Button, Card, ErrorBanner } from "@/components/ui";
import { callApi, readFileAsBase64 } from "@/lib/api-client";
import type { SolvedProblem } from "@/lib/claude";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

function isAcceptedImageType(type: string): type is AcceptedImageType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

export default function SolvePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [solution, setSolution] = useState<SolvedProblem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(selected: File | null) {
    setSolution(null);
    setError(null);
    if (!selected || !isAcceptedImageType(selected.type)) {
      setFile(null);
      setPreview(null);
      if (selected) setError("請上傳 jpg、png、gif 或 webp 格式的圖片。");
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  async function solve() {
    if (!file || !isAcceptedImageType(file.type)) return;
    setLoading(true);
    setError(null);
    try {
      const data = await readFileAsBase64(file);
      const { solution } = await callApi<{ solution: SolvedProblem }>("/api/solve", {
        mediaType: file.type,
        data,
      });
      setSolution(solution);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解題失敗，請再試一次。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">拍照解題</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          拍下或上傳一張題目照片，AI 會辨識題目並逐步引導你解題。
        </p>
      </div>

      <Card>
        {preview ? (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- 使用者本機挑的檔案，走 object URL，不需要 next/image 的遠端最佳化 */}
            <img src={preview} alt="題目預覽" className="max-h-80 rounded-xl object-contain" />
            <Button variant="ghost" onClick={() => handleFile(null)}>
              重新選擇照片
            </Button>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-border)] py-10 text-center transition-colors hover:border-[var(--color-primary)]">
            <Camera className="text-[var(--color-primary)]" size={28} />
            <span className="text-sm font-medium">拍照或選擇題目照片</span>
            <span className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
              <Upload size={12} />
              jpg / png / gif / webp
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
      </Card>

      {error && <ErrorBanner message={error} />}

      {file && !solution && (
        <Button onClick={solve} loading={loading} className="self-end">
          開始解題
        </Button>
      )}

      {solution && (
        <Card className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-tertiary)]">辨識出的題目</p>
            <p className="mt-1 text-sm">{solution.problemText}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-tertiary)]">解題步驟</p>
            <ol className="mt-1 flex flex-col gap-2">
              {solution.steps.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-semibold text-[var(--color-primary)]">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl bg-[var(--color-primary-soft)] p-3">
            <p className="text-xs font-semibold text-[var(--color-primary)]">答案</p>
            <p className="mt-1 text-sm font-medium">{solution.answer}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
