import { NextResponse } from "next/server";

import { withErrorHandling } from "@/lib/api-handler";
import { generateQuiz } from "@/lib/claude";

export const POST = withErrorHandling(async (req: Request) => {
  const { context, count } = (await req.json()) as { context: string; count?: number };
  if (!context) {
    return NextResponse.json({ error: "缺少 context。" }, { status: 400 });
  }
  const questions = await generateQuiz(context, count ?? 8);
  return NextResponse.json({ questions });
});
