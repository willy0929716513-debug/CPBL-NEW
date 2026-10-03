import "server-only";

import { NextResponse } from "next/server";

/**
 * 統一包裝每個 API route 的錯誤處理：Claude API 的呼叫可能因為很多原因
 * 失敗（沒設定金鑰、額度用完、網路問題、回傳格式不如預期），全部集中在
 * 這裡轉成一致的 JSON 錯誤格式，前端只需要處理一種錯誤結構。
 */
export function withErrorHandling(
  handler: (req: Request) => Promise<NextResponse>,
): (req: Request) => Promise<NextResponse> {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知錯誤，請稍後再試一次。";
      console.error(message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
