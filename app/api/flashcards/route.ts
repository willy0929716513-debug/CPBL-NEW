import { NextResponse } from "next/server";

import { withErrorHandling } from "@/lib/api-handler";
import { generateFlashcards } from "@/lib/claude";

export const POST = withErrorHandling(async (req: Request) => {
  const { context, count } = (await req.json()) as { context: string; count?: number };
  if (!context) {
    return NextResponse.json({ error: "缺少 context。" }, { status: 400 });
  }
  const cards = await generateFlashcards(context, count ?? 12);
  return NextResponse.json({ cards });
});
