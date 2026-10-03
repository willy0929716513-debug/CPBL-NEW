import { NextResponse } from "next/server";

import { withErrorHandling } from "@/lib/api-handler";
import { generatePodcastScript } from "@/lib/claude";

export const POST = withErrorHandling(async (req: Request) => {
  const { topic, context } = (await req.json()) as { topic: string; context: string };
  if (!topic || !context) {
    return NextResponse.json({ error: "缺少 topic 或 context。" }, { status: 400 });
  }
  const podcast = await generatePodcastScript(topic, context);
  return NextResponse.json({ podcast });
});
