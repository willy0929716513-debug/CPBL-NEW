import { NextResponse } from "next/server";

import { withErrorHandling } from "@/lib/api-handler";
import { solveFromImage } from "@/lib/claude";

export const POST = withErrorHandling(async (req: Request) => {
  const { mediaType, data } = (await req.json()) as {
    mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
  if (!mediaType || !data) {
    return NextResponse.json({ error: "缺少圖片資料。" }, { status: 400 });
  }
  const solution = await solveFromImage(mediaType, data);
  return NextResponse.json({ solution });
});
