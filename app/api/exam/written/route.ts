import { NextResponse } from "next/server";

import { withErrorHandling } from "@/lib/api-handler";
import { generateWrittenExam } from "@/lib/claude";

export const POST = withErrorHandling(async (req: Request) => {
  const { context } = (await req.json()) as { context: string };
  if (!context) {
    return NextResponse.json({ error: "缺少 context。" }, { status: 400 });
  }
  const exam = await generateWrittenExam(context);
  return NextResponse.json({ exam });
});
