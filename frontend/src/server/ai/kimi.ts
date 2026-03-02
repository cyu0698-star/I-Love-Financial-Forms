import {
  TemplateType,
  TemplateRecognitionResult,
  DataExtractionResult,
} from "@/features/documents/types";
import {
  isSupportedVisionImageMimeType,
  isPdfMimeType,
} from "@/server/layout/fileTypes.mjs";
import { buildLowConfidenceFields } from "@/server/layout/confidence.mjs";
import {
  mapCompanyInfo,
  mapSummary,
  mapTableRows,
} from "@/server/layout/extractionMap.mjs";

const KIMI_API_KEY =
  process.env.KIMI_API_KEY || "sk-KPPIIetCLtcDyDaaDEz5vAEeAc7vjQYnjHlKm6n4nt45KXPI";
const KIMI_API_ENDPOINT = "https://api.moonshot.cn/v1/chat/completions";
const KIMI_FILES_ENDPOINT = "https://api.moonshot.cn/v1/files";
const KIMI_VISION_MODEL = "moonshot-v1-8k-vision-preview";
const KIMI_TEXT_MODEL = "moonshot-v1-32k";

const TEMPLATE_PROMPTS: Record<TemplateType, string> = {
  delivery_note: `你是一个专业的财务文件识别助手。请从上传的文件中提取送货单信息，并以 JSON 格式返回。
请提取以下字段：
- headers: 表头数组，例如 ["日期", "品名", "规格", "数量", "单价", "金额", "备注"]
- rows: 数据行数组，每行是一个对象
- summary: 摘要信息，包含 totalAmount(总金额), documentDate(单据日期), supplier(供应商/客户), documentType(单据类型), documentNumber(单据编号)
注意：请忽略盖章、印章、签名等信息。只返回 JSON。`,
  reconciliation: `你是一个专业的财务文件识别助手。请从上传的文件中提取对账单信息，并以 JSON 格式返回。
请提取以下字段：
- headers: 表头数组，例如 ["日期", "摘要", "借方金额", "贷方金额", "余额", "备注"]
- rows: 数据行数组，每行是一个对象
- summary: 摘要信息，包含 totalAmount, documentDate, supplier, documentType, documentNumber
注意：请忽略盖章、印章、签名等信息。只返回 JSON。`,
  purchase_order: `你是一个专业的财务文件识别助手。请从上传的文件中提取采购单信息，并以 JSON 格式返回。
请提取以下字段：
- headers: 表头数组，例如 ["序号", "品名", "规格型号", "单位", "数量", "单价", "金额"]
- rows: 数据行数组，每行是一个对象
- summary: 摘要信息，包含 totalAmount, documentDate, supplier, documentType, documentNumber
注意：请忽略盖章、印章、签名等信息。只返回 JSON。`,
  bank_statement: `你是一个专业的财务文件识别助手。请从上传的文件中提取银行流水/对账信息，并以 JSON 格式返回。
请提取以下字段：
- headers: 表头数组，例如 ["交易日期", "交易类型", "对方账户", "摘要", "收入", "支出", "余额"]
- rows: 数据行数组，每行是一个对象
- summary: 摘要信息，包含 totalAmount, documentDate, supplier, documentType, documentNumber
注意：请忽略盖章、印章、签名等信息。只返回 JSON。`,
  payment_list: `你是一个专业的财务文件识别助手。请从上传的文件中提取支付清单信息，并以 JSON 格式返回。
请提取以下字段：
- headers: 表头数组，例如 ["序号", "收款方", "账号", "金额", "用途", "日期", "状态"]
- rows: 数据行数组，每行是一个对象
- summary: 摘要信息，包含 totalAmount, documentDate, supplier, documentType, documentNumber
注意：请忽略盖章、印章、签名等信息。只返回 JSON。`,
  quotation: `你是一个专业的财务文件识别助手。请从上传的文件中提取报价单信息，并以 JSON 格式返回。
请提取以下字段：
- headers: 表头数组，例如 ["序号", "规格", "公斤", "数量/公斤", "单价", "金额", "备注"]
- rows: 数据行数组，每行是一个对象
- summary: 摘要信息，包含 totalAmount, documentDate, supplier, documentType, documentNumber, contact, address
注意：请忽略盖章、印章、签名、水印等信息。只返回 JSON。`,
};

function extractMessageText(payload: unknown): string {
  const root = payload as Record<string, unknown>;
  const choices = root.choices as Array<Record<string, unknown>> | undefined;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const message = (first?.message || {}) as Record<string, unknown>;
  const content = message.content;

  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

function parseJsonFromText(
  text: string,
  noJsonError: string,
  parseError: string
): Record<string, unknown> {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(noJsonError);
  }
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    throw new Error(parseError);
  }
}

async function callKimi(requestBody: Record<string, unknown>): Promise<string> {
  const response = await fetch(KIMI_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KIMI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kimi API 请求失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = extractMessageText(data);
  if (!text) throw new Error("Kimi 未返回有效响应");
  return text;
}

async function uploadFileToKimi(fileBase64: string, filename: string): Promise<string> {
  const binaryString = atob(fileBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "application/pdf" });
  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append("purpose", "file-extract");

  const response = await fetch(KIMI_FILES_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${KIMI_API_KEY}` },
    body: formData,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`文件上传失败: ${response.status} - ${errorText}`);
  }
  const data = (await response.json()) as { id?: string };
  if (!data.id) throw new Error("文件上传成功但未返回 file_id");
  return data.id;
}

async function getFileContent(fileId: string): Promise<string> {
  const response = await fetch(`${KIMI_FILES_ENDPOINT}/${fileId}/content`, {
    method: "GET",
    headers: { Authorization: `Bearer ${KIMI_API_KEY}` },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`获取文件内容失败: ${response.status} - ${errorText}`);
  }
  return response.text();
}

export async function processDocument(
  fileBase64: string,
  mimeType: string,
  templateType: TemplateType
) {
  const prompt = TEMPLATE_PROMPTS[templateType];
  const isPdf = isPdfMimeType(mimeType);

  let requestBody: Record<string, unknown>;
  if (isPdf) {
    const fileId = await uploadFileToKimi(fileBase64, `document_${Date.now()}.pdf`);
    const fileContent = await getFileContent(fileId);
    requestBody = {
      model: KIMI_TEXT_MODEL,
      messages: [
        { role: "system", content: fileContent },
        { role: "user", content: prompt },
      ],
      max_tokens: 4096,
    };
  } else {
    if (!isSupportedVisionImageMimeType(mimeType)) {
      throw new Error(`不支持的文件类型: ${mimeType || "unknown"}。Kimi 视觉模型仅支持图片。`);
    }
    requestBody = {
      model: KIMI_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: 4096,
    };
  }

  const text = await callKimi(requestBody);
  const parsed = parseJsonFromText(
    text,
    "Kimi 未能返回有效的结构化数据",
    "Kimi 返回的数据格式无法解析"
  );
  return {
    headers: (parsed.headers as string[]) || [],
    rows: (parsed.rows as Record<string, string>[]) || [],
    summary: (parsed.summary as Record<string, string>) || {},
    rawText: text,
  };
}

export async function recognizeTemplateStructure(
  fileBase64: string,
  mimeType: string
): Promise<TemplateRecognitionResult> {
  if (!isSupportedVisionImageMimeType(mimeType)) {
    throw new Error(`模板识别仅支持图片文件（JPG/PNG/WEBP），当前类型: ${mimeType || "unknown"}`);
  }

  const prompt = `你是一个专业的表单结构分析助手。请分析上传的单据/表单图片，识别其结构并以 JSON 格式返回。
请识别：
1) companyInfo.fields: key/label/type(required)
2) tableHeaders
3) tableFieldTypes (text/number/date)
4) summaryFields
只返回 JSON。`;

  const text = await callKimi({
    model: KIMI_VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
          { type: "text", text: prompt },
        ],
      },
    ],
    max_tokens: 4096,
  });

  const parsed = parseJsonFromText(
    text,
    "Kimi 未能返回有效的结构化数据",
    "Kimi 返回的模板结构数据无法解析"
  );
  return {
    companyInfo: (parsed.companyInfo as TemplateRecognitionResult["companyInfo"]) || { fields: [] },
    tableHeaders: (parsed.tableHeaders as string[]) || [],
    tableFieldTypes: (parsed.tableFieldTypes as string[]) || [],
    summaryFields: (parsed.summaryFields as string[]) || [],
  };
}

export async function classifyTemplateTokensByVision(
  fileBase64: string,
  mimeType: string,
  tokens: Array<{
    id: string;
    text: string;
    bbox: { x: number; y: number; w: number; h: number };
  }>
): Promise<{
  fixedTokenIds: string[];
  variableTokenIds: string[];
  tableHeaderTokenIds: string[];
}> {
  if (!isSupportedVisionImageMimeType(mimeType)) {
    return { fixedTokenIds: [], variableTokenIds: [], tableHeaderTokenIds: [] };
  }

  const compactTokens = tokens
    .filter(
      (t) =>
        t &&
        typeof t.id === "string" &&
        typeof t.text === "string" &&
        t.text.trim().length > 0 &&
        t.bbox &&
        typeof t.bbox.x === "number" &&
        typeof t.bbox.y === "number" &&
        typeof t.bbox.w === "number" &&
        typeof t.bbox.h === "number"
    )
    .slice(0, 360)
    .map((t) => ({
      id: t.id,
      text: t.text.trim(),
      bbox: {
        x: Number(t.bbox.x.toFixed(1)),
        y: Number(t.bbox.y.toFixed(1)),
        w: Number(t.bbox.w.toFixed(1)),
        h: Number(t.bbox.h.toFixed(1)),
      },
    }));

  if (compactTokens.length === 0) {
    return { fixedTokenIds: [], variableTokenIds: [], tableHeaderTokenIds: [] };
  }

  const prompt = `你是模板版式语义分析器。你会收到一张票据图片和 OCR tokens（含 id/text/bbox 像素坐标）。
任务：判断每个 token 是否属于“模板固定文本”还是“每次变化的数据”。
规则：
1) fixedTokenIds：固定文本（logo名、标签名、固定说明、固定表头、固定脚注等）。
2) variableTokenIds：会变化的数据（单号、日期、客户名、客户地址、电话、数量、单价、金额、商品明细值、订单号等）。
   注意："产品名称"如果是表头列名，归入 tableHeaderTokenIds；如果是"产品名称: xxx"或具体商品名文本，归入 variableTokenIds。
3) tableHeaderTokenIds：表格表头（通常也是固定文本）。
4) 只能使用输入里出现过的 token id，不要编造 id。
5) 输出必须是 JSON，格式：
{"fixedTokenIds":["..."],"variableTokenIds":["..."],"tableHeaderTokenIds":["..."]}`;

  const text = await callKimi({
    model: KIMI_VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
          { type: "text", text: `${prompt}\n\nOCR tokens:\n${JSON.stringify(compactTokens)}` },
        ],
      },
    ],
    max_tokens: 4096,
  });

  const parsed = parseJsonFromText(
    text,
    "Kimi 未返回 token 语义分类 JSON",
    "Kimi token 语义分类 JSON 解析失败"
  );

  const asIdArray = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((v) => typeof v === "string" && v.trim().length > 0)
      : [];

  return {
    fixedTokenIds: asIdArray(parsed.fixedTokenIds),
    variableTokenIds: asIdArray(parsed.variableTokenIds),
    tableHeaderTokenIds: asIdArray(parsed.tableHeaderTokenIds),
  };
}

export async function extractDataToTemplate(
  fileBase64: string,
  mimeType: string,
  templateStructure: {
    companyInfo: { fields: Array<{ key: string; label: string }> };
    tableHeaders: string[];
    summaryFields: string[];
  },
  options?: {
    templateLayout?: {
      fields?: Array<{ key: string; label: string; confidence?: number }>;
    } | null;
    ocrTokens?: Array<{
      text: string;
      bbox?: { x: number; y: number; w: number; h: number };
    }> | null;
  }
): Promise<DataExtractionResult> {
  const companyFieldLabels = templateStructure.companyInfo.fields.map((f) => f.label).join("、");
  const companyFieldKeys = templateStructure.companyInfo.fields.map((f) => f.key).join("、");
  const tableHeadersStr = templateStructure.tableHeaders.join("、");
  const summaryFieldsStr = templateStructure.summaryFields.join("、");
  const prompt = `请从单据中提取数据并按模板返回 JSON。
公司字段: ${companyFieldLabels || "无"}
公司字段key: ${companyFieldKeys || "无"}
表格列: ${tableHeadersStr || "无"}
汇总字段: ${summaryFieldsStr || "无"}
要求：
1) companyInfo 的键必须使用上述 company 字段 key。
2) tableRows 每一行对象的键必须使用上述“表格列”原文。
3) summary 的键必须使用上述“汇总字段”原文。
4) 缺失字段填空字符串。
只返回 JSON。`;

  let requestBody: Record<string, unknown>;
  if (isPdfMimeType(mimeType)) {
    const fileId = await uploadFileToKimi(fileBase64, `source_${Date.now()}.pdf`);
    const fileContent = await getFileContent(fileId);
    requestBody = {
      model: KIMI_TEXT_MODEL,
      messages: [
        { role: "system", content: fileContent },
        { role: "user", content: prompt },
      ],
      max_tokens: 8192,
    };
  } else {
    if (!isSupportedVisionImageMimeType(mimeType)) {
      throw new Error(`不支持的文件类型: ${mimeType || "unknown"}。模板提取目前仅支持 PDF 或图片。`);
    }
    requestBody = {
      model: KIMI_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: 8192,
    };
  }

  const text = await callKimi(requestBody);
  const parsed = parseJsonFromText(
    text,
    "Kimi 未能返回有效的结构化数据",
    "Kimi 返回的数据无法解析"
  );
  const rawCompanyInfo = (parsed.companyInfo as Record<string, unknown>) || {};
  const rawTableRows =
    (parsed.tableRows as Array<Record<string, unknown> | unknown[]>) ||
    (parsed.rows as Array<Record<string, unknown> | unknown[]>) ||
    [];
  const rawSummary = (parsed.summary as Record<string, unknown>) || {};
  const companyInfo = mapCompanyInfo(
    rawCompanyInfo,
    templateStructure.companyInfo.fields
  ) as Record<string, string>;
  const tableRows = mapTableRows(
    rawTableRows,
    templateStructure.tableHeaders
  ) as Record<string, string>[];
  const summary = mapSummary(
    rawSummary,
    templateStructure.summaryFields
  ) as Record<string, string>;
  const lowConfidenceFields =
    options?.templateLayout?.fields && options.templateLayout.fields.length > 0
      ? buildLowConfidenceFields({
          templateLayout: options.templateLayout,
          companyInfo,
          ocrTokens: options?.ocrTokens || [],
        })
      : [];

  return {
    companyInfo,
    tableRows,
    summary,
    lowConfidenceFields,
  };
}
