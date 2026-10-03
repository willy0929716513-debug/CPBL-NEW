import { NextResponse } from "next/server";

import { withErrorHandling } from "@/lib/api-handler";
import { analyzeMaterial, type MaterialPart } from "@/lib/claude";

interface AnalyzeRequestBody {
  parts: MaterialPart[];
}

export const POST = withErrorHandling(async (req: Request) => {
  const body = (await req.json()) as AnalyzeRequestBody;
  if (!body.parts || body.parts.length === 0) {
    return NextResponse.json({ error: "沒有收到任何教材內容。" }, { status: 400 });
  }

  const analysis = await analyzeMaterial(body.parts);

  // 下游功能（導讀課程、Podcast、Flashcards、出題...）都用這段文字當「背景
  // 知識」，不會每次都重新把完整的圖片/PDF 內容送一次給 Claude——那樣既慢
  // 又浪費 token。優先用使用者上傳的純文字內容本身；只有圖片/PDF 這種沒有
  // 現成文字的情況，才退而求其次用 AI 自己產生的摘要當背景知識。
  const textParts = body.parts.filter((p): p is Extract<MaterialPart, { type: "text" }> => p.type === "text");
  const context =
    textParts.length > 0
      ? textParts.map((p) => p.text).join("\n\n")
      : `科目：${analysis.subject}\n重點主題：${analysis.topics.join("、")}\n摘要：${analysis.summary}`;

  return NextResponse.json({ analysis, context });
});
