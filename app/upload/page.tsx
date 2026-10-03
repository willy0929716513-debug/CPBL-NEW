"use client";

import { FileText, Image as ImageIcon, Upload as UploadIcon, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Card, ErrorBanner } from "@/components/ui";
import { callApi, readFileAsBase64, readFileAsText } from "@/lib/api-client";
import type { MaterialAnalysis, MaterialPart } from "@/lib/claude";
import { saveMaterial } from "@/lib/db";

const ACCEPTED = "text/plain,application/pdf,image/png,image/jpeg,image/webp,image/gif";

function iconFor(file: File) {
  if (file.type === "application/pdf" || file.type === "text/plain") return FileText;
  return ImageIcon;
}

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const accepted = Array.from(list).filter((f) => ACCEPTED.split(",").includes(f.type));
    const rejected = list.length - accepted.length;
    if (rejected > 0) {
      setError(`有 ${rejected} 個檔案格式不支援，只接受純文字 (.txt)、PDF、圖片 (png/jpg/webp/gif)。`);
    }
    setFiles((prev) => [...prev, ...accepted]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const parts: MaterialPart[] = await Promise.all(
        files.map(async (file): Promise<MaterialPart> => {
          if (file.type === "text/plain") {
            return { type: "text", text: await readFileAsText(file) };
          }
          if (file.type === "application/pdf") {
            return { type: "pdf", data: await readFileAsBase64(file) };
          }
          return {
            type: "image",
            mediaType: file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: await readFileAsBase64(file),
          };
        }),
      );

      const { analysis, context } = await callApi<{ analysis: MaterialAnalysis; context: string }>(
        "/api/analyze",
        { parts },
      );

      const material = await saveMaterial({
        fileName: files.map((f) => f.name).join("、"),
        context,
        analysis,
      });

      router.push(`/materials/${material.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失敗，請稍後再試一次。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">新增教材</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          上傳筆記、課本、簡報（純文字或 PDF）或考古題照片，AI 會分析內容並規劃一份讀書計畫。
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      <Card>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-border)] py-10 text-center transition-colors hover:border-[var(--color-primary)]">
          <UploadIcon className="text-[var(--color-primary)]" size={28} />
          <span className="text-sm font-medium">點擊選擇檔案，或拖曳到這裡</span>
          <span className="text-xs text-[var(--color-text-tertiary)]">支援 .txt、PDF、圖片，可多選</span>
          <input
            type="file"
            accept={ACCEPTED}
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </label>

        {files.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {files.map((file, i) => {
              const Icon = iconFor(file);
              return (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-2 rounded-xl bg-black/[0.02] px-3 py-2 text-sm"
                >
                  <Icon size={16} className="shrink-0 text-[var(--color-text-tertiary)]" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <button
                    onClick={() => removeFile(i)}
                    className="shrink-0 text-[var(--color-text-tertiary)] hover:text-red-600"
                    aria-label="移除檔案"
                  >
                    <X size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Button onClick={handleSubmit} disabled={files.length === 0} loading={loading} className="self-end">
        {loading ? "AI 分析中..." : "開始分析"}
      </Button>
    </div>
  );
}
