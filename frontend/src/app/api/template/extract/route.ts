import { NextRequest, NextResponse } from "next/server";
import { extractDataToTemplate } from "@/server/ai/kimi";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileBase64, mimeType, templateStructure } = body as {
      fileBase64: string;
      mimeType: string;
      templateStructure: {
        companyInfo: { fields: Array<{ key: string; label: string }> };
        tableHeaders: string[];
        summaryFields: string[];
      };
    };

    if (!fileBase64 || !mimeType || !templateStructure) {
      return NextResponse.json(
        { error: "缺少必要参数：fileBase64, mimeType, templateStructure" },
        { status: 400 }
      );
    }

    const result = await extractDataToTemplate(
      fileBase64,
      mimeType,
      templateStructure
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Data extraction error:", error);

    let message =
      error instanceof Error ? error.message : "数据提取失败，请重试";

    if (
      message.includes("fetch failed") ||
      message.includes("getaddrinfo ENOTFOUND") ||
      message.includes("connect ETIMEDOUT")
    ) {
      message =
        "无法连接到 AI API，请检查网络连接后重试。";
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
