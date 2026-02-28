import { GoogleGenAI } from "@google/genai";
import { TemplateType } from "@/features/documents/types";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn(
    "[Gemini] GEMINI_API_KEY 未配置，将在调用时抛出错误。请在 .env.local 中设置 GEMINI_API_KEY。"
  );
}

// 新版官方 JS SDK 客户端
const genAI = new GoogleGenAI({
  apiKey,
});

const TEMPLATE_PROMPTS: Record<TemplateType, string> = {
  delivery_note: `你是一个专业的财务文件识别助手。请从上传的文件中提取送货单信息，并以 JSON 格式返回。
请提取以下字段：
- headers: 表头数组，例如 ["日期", "品名", "规格", "数量", "单价", "金额", "备注"]
- rows: 数据行数组，每行是一个对象
- summary: 摘要信息，包含 totalAmount(总金额), documentDate(单据日期), supplier(供应商/客户), documentType(单据类型), documentNumber(单据编号)

注意：请忽略文档中的盖章、印章、签名等信息，不需要提取这些内容。
只返回 JSON，不要返回其他内容。如果某个字段无法识别，请填写空字符串。`,

  reconciliation: `你是一个专业的财务文件识别助手。请从上传的文件中提取对账单信息，并以 JSON 格式返回。
请提取以下字段：
- headers: 表头数组，例如 ["日期", "摘要", "借方金额", "贷方金额", "余额", "备注"]
- rows: 数据行数组，每行是一个对象
- summary: 摘要信息，包含 totalAmount(总金额), documentDate(单据日期), supplier(对方单位), documentType(单据类型), documentNumber(单据编号)

注意：请忽略文档中的盖章、印章、签名等信息，不需要提取这些内容。
只返回 JSON，不要返回其他内容。如果某个字段无法识别，请填写空字符串。`,

  purchase_order: `你是一个专业的财务文件识别助手。请从上传的文件中提取采购单信息，并以 JSON 格式返回。
请提取以下字段：
- headers: 表头数组，例如 ["序号", "品名", "规格型号", "单位", "数量", "单价", "金额"]
- rows: 数据行数组，每行是一个对象
- summary: 摘要信息，包含 totalAmount(合计金额), documentDate(采购日期), supplier(供应商), documentType(单据类型), documentNumber(采购单号)

注意：请忽略文档中的盖章、印章、签名等信息，不需要提取这些内容。
只返回 JSON，不要返回其他内容。如果某个字段无法识别，请填写空字符串。`,

  bank_statement: `你是一个专业的财务文件识别助手。请从上传的文件中提取银行流水/对账信息，并以 JSON 格式返回。
请提取以下字段：
- headers: 表头数组，例如 ["交易日期", "交易类型", "对方账户", "摘要", "收入", "支出", "余额"]
- rows: 数据行数组，每行是一个对象
- summary: 摘要信息，包含 totalAmount(期末余额), documentDate(账单日期), supplier(开户行), documentType(单据类型), documentNumber(账号)

注意：请忽略文档中的盖章、印章、签名等信息，不需要提取这些内容。
只返回 JSON，不要返回其他内容。如果某个字段无法识别，请填写空字符串。`,

  payment_list: `你是一个专业的财务文件识别助手。请从上传的文件中提取支付清单信息，并以 JSON 格式返回。
请提取以下字段：
- headers: 表头数组，例如 ["序号", "收款方", "账号", "金额", "用途", "日期", "状态"]
- rows: 数据行数组，每行是一个对象
- summary: 摘要信息，包含 totalAmount(总支付金额), documentDate(支付日期), supplier(付款方), documentType(单据类型), documentNumber(批次号)

注意：请忽略文档中的盖章、印章、签名等信息，不需要提取这些内容。
只返回 JSON，不要返回其他内容。如果某个字段无法识别，请填写空字符串。`,

  quotation: `你是一个专业的财务文件识别助手。请从上传的文件中提取报价单信息，并以 JSON 格式返回。
请提取以下字段：
- headers: 表头数组，例如 ["序号", "规格", "公斤", "数量/公斤", "单价", "金额", "备注"]
- rows: 数据行数组，每行是一个对象
- summary: 摘要信息，包含 totalAmount(合计金额), documentDate(报价日期), supplier(供应商/公司名称), documentType(单据类型), documentNumber(报价单号), contact(联系电话), address(地址)

注意：请忽略文档中的盖章、印章、签名、水印等信息，不需要提取这些内容。
只返回 JSON，不要返回其他内容。如果某个字段无法识别，请填写空字符串。`,
};

export async function processDocument(
  fileBase64: string,
  mimeType: string,
  templateType: TemplateType
) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 未配置，请先在 .env.local 中设置后重启服务。");
  }

  // 使用官方最新推荐的 gemini-3-flash-preview 模型
  const model = "gemini-3-flash-preview";

  const prompt = TEMPLATE_PROMPTS[templateType];

  // 按新版 JS 客户端的调用方式：ai.models.generateContent
  const response = await genAI.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              data: fileBase64,
              mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
  });

  const text = response.text ?? "";

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI 未能返回有效的结构化数据");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      headers: parsed.headers || [],
      rows: parsed.rows || [],
      summary: parsed.summary || {},
      rawText: text,
    };
  } catch {
    throw new Error("AI 返回的数据格式无法解析");
  }
}
