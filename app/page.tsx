"use client";

import { ChevronRight, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button, Card, EmptyState } from "@/components/ui";
import { deleteMaterial, listMaterials, type Material } from "@/lib/db";

export default function DashboardPage() {
  const [materials, setMaterials] = useState<Material[] | null>(null);

  useEffect(() => {
    listMaterials().then(setMaterials);
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這份教材嗎？所有相關的讀書計畫、卡片、測驗紀錄都會一起刪除。")) return;
    await deleteMaterial(id);
    setMaterials((prev) => prev?.filter((m) => m.id !== id) ?? null);
  }

  if (materials === null) {
    return <p className="text-sm text-[var(--color-text-secondary)]">載入中...</p>;
  }

  if (materials.length === 0) {
    return (
      <EmptyState
        title="還沒有任何教材"
        description="上傳你的筆記、課本、簡報或考古題照片，AI 會幫你分析內容、規劃讀書計畫。"
        action={
          <Link href="/upload">
            <Button>
              <Plus size={16} />
              新增教材
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">我的教材</h1>
        <Link href="/upload">
          <Button>
            <Plus size={16} />
            新增教材
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {materials.map((material) => (
          <Card key={material.id} className="flex items-center justify-between gap-4">
            <Link href={`/materials/${material.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="truncate font-semibold">{material.fileName}</p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {material.analysis.subject} · {material.analysis.topics.slice(0, 3).join("、")}
              </p>
            </Link>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleDelete(material.id)}
                className="rounded-full p-2 text-[var(--color-text-tertiary)] hover:bg-red-50 hover:text-red-600"
                aria-label="刪除教材"
              >
                <Trash2 size={16} />
              </button>
              <Link
                href={`/materials/${material.id}`}
                className="rounded-full p-2 text-[var(--color-text-tertiary)] hover:bg-black/[0.04]"
              >
                <ChevronRight size={18} />
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
