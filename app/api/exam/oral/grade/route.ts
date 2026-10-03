import { NextResponse } from "next/server";

import { withErrorHandling } from "@/lib/api-handler";
import { gradeOralAnswer } from "@/lib/claude";

export const POST = withErrorHandling(async (req: Request) => {
  const { context, question, transcript } = (await req.json()) as {
    context: string;
    question: string;
    transcript: string;
  };
  if (!context || !question || !transcript) {
    return NextResponse.json({ error: "缺少 context、question 或 transcript。" }, { status: 400 });
  }
  const grade = await gradeOralAnswer(context, question, transcript);
  return NextResponse.json({ grade });
});
