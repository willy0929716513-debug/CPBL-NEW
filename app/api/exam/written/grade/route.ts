import { NextResponse } from "next/server";

import { withErrorHandling } from "@/lib/api-handler";
import { gradeWrittenExam, type WrittenExamQuestion } from "@/lib/claude";

export const POST = withErrorHandling(async (req: Request) => {
  const { questions, answers } = (await req.json()) as {
    questions: WrittenExamQuestion[];
    answers: string[];
  };
  if (!questions || !answers) {
    return NextResponse.json({ error: "缺少 questions 或 answers。" }, { status: 400 });
  }
  const graded = await gradeWrittenExam(questions, answers);
  return NextResponse.json({ graded });
});
