import { TemplateType, TemplateRecognitionResult, DataExtractionResult } from "@/features/documents/types";

// Kimi API 配置
const KIMI_API_KEY = process.env.KIMI_API_KEY || 'sk-KPPIIetCLtcDyDaaDEz5vAEeAc7vjQYnjHlKm6n4nt45KXPI';
const KIMI_API_ENDPOINT = 'https://api.moonshot.cn/v1/chat/completions';
const KIMI_FILES_ENDPOINT = 'https://api.moonshot.cn/v1/files';
const KIMI_VISION_MODEL = 'moonshot-v1-8k-vision-preview';
const KIMI_TEXT_MODEL = 'moonshot-v1-32k'; // 用于处理 PDF 文件

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

// 上传文件到 Kimi（用于 PDF 等文档）
async function uploadFileToKimi(fileBase64: string, filename: string): Promise<string> {
  // 将 base64 转换为 Blob
  const binaryString = atob(fileBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'application/pdf' });

  // 创建 FormData
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('purpose', 'file-extract');

  console.log(`[Kimi] 上传文件: ${filename}`);

  const response = await fetch(KIMI_FILES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KIMI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Kimi] 文件上传失败:', response.status, errorText);
    throw new Error(`文件上传失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`[Kimi] 文件上传成功, file_id: ${data.id}`);
  return data.id;
}

// 获取文件内容
async function getFileContent(fileId: string): Promise<string> {
  const response = await fetch(`${KIMI_FILES_ENDPOINT}/${fileId}/content`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${KIMI_API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Kimi] 获取文件内容失败:', response.status, errorText);
    throw new Error(`获取文件内容失败: ${response.status} - ${errorText}`);
  }

  const content = await response.text();
  return content;
}

export async function processDocument(
  fileBase64: string,
  mimeType: string,
  templateType: TemplateType
) {
  const prompt = TEMPLATE_PROMPTS[templateType];
  const isPdf = mimeType === 'application/pdf';

  let requestBody;

  if (isPdf) {
    // PDF 文件：使用文件上传 API
    console.log(`[Kimi] 检测到 PDF 文件，使用文件上传方式处理`);
    
    const fileId = await uploadFileToKimi(fileBase64, `document_${Date.now()}.pdf`);
    const fileContent = await getFileContent(fileId);
    
    console.log(`[Kimi] 文件内容长度: ${fileContent.length} 字符`);

    requestBody = {
      model: KIMI_TEXT_MODEL,
      messages: [
        {
          role: "system",
          content: fileContent,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 4096,
    };

    console.log(`[Kimi] 使用模型: ${KIMI_TEXT_MODEL} (文本模型)`);
  } else {
    // 图片文件：使用 vision API
    console.log(`[Kimi] 检测到图片文件，使用 vision API 处理`);
    
    const imageUrl = `data:${mimeType};base64,${fileBase64}`;
    
    requestBody = {
      model: KIMI_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
      max_tokens: 4096,
    };

    console.log(`[Kimi] 使用模型: ${KIMI_VISION_MODEL} (视觉模型)`);
  }

  console.log(`[Kimi] API 端点: ${KIMI_API_ENDPOINT}`);

  const response = await fetch(KIMI_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${KIMI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Kimi] API 响应错误:", response.status, errorText);
    throw new Error(`Kimi API 请求失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // 提取回复内容 (OpenAI 兼容格式)
  const text = data.choices?.[0]?.message?.content || "";
  
  if (!text) {
    throw new Error("Kimi 未返回有效响应");
  }

  console.log("[Kimi] 原始响应:", text.substring(0, 500));

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Kimi 未能返回有效的结构化数据");
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
    throw new Error("Kimi 返回的数据格式无法解析");
  }
}

// 识别模板结构 - 从模板截图中识别表单结构
export async function recognizeTemplateStructure(
  fileBase64: string,
  mimeType: string
): Promise<TemplateRecognitionResult> {
  const prompt = `你是一个专业的表单结构分析助手。请分析上传的单据/表单图片，识别其结构并以 JSON 格式返回。

请识别以下内容：
1. companyInfo: 公司/抬头信息区域的字段，返回一个对象包含 fields 数组
   - 每个 field 包含: key(字段标识), label(显示名称), type(text/number/date), required(是否必填)
   - 常见字段如：公司名称、电话、传真、地址、日期等

2. tableHeaders: 表格区域的列表头数组，例如 ["序号", "规格", "数量", "单价", "金额", "备注"]

3. tableFieldTypes: 每列对应的数据类型数组，例如 ["number", "text", "number", "number", "number", "text"]
   - 类型只能是: text, number, date

4. summaryFields: 汇总/底部区域的字段名称数组，例如 ["合计", "备注说明", "制表人"]

请严格按以下 JSON 格式返回，不要返回其他内容：
{
  "companyInfo": {
    "fields": [
      {"key": "companyName", "label": "公司名称", "type": "text", "required": true},
      {"key": "phone", "label": "电话", "type": "text", "required": false}
    ]
  },
  "tableHeaders": ["序号", "品名", "规格", "数量", "单价", "金额"],
  "tableFieldTypes": ["number", "text", "text", "number", "number", "number"],
  "summaryFields": ["合计", "备注"]
}

注意：
- 请忽略文档中的盖章、印章、签名、水印等信息
- 如果某个区域没有内容，返回空数组
- 表头和类型数组长度必须一致`;

  const imageUrl = `data:${mimeType};base64,${fileBase64}`;
  
  const requestBody = {
    model: KIMI_VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            },
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
    max_tokens: 4096,
  };

  console.log(`[Kimi] 识别模板结构，使用模型: ${KIMI_VISION_MODEL}`);

  const response = await fetch(KIMI_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${KIMI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Kimi] API 响应错误:", response.status, errorText);
    throw new Error(`Kimi API 请求失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  
  if (!text) {
    throw new Error("Kimi 未返回有效响应");
  }

  console.log("[Kimi] 模板识别响应:", text.substring(0, 500));

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Kimi 未能返回有效的结构化数据");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      companyInfo: parsed.companyInfo || { fields: [] },
      tableHeaders: parsed.tableHeaders || [],
      tableFieldTypes: parsed.tableFieldTypes || [],
      summaryFields: parsed.summaryFields || [],
    };
  } catch {
    throw new Error("Kimi 返回的模板结构数据无法解析");
  }
}

// 提取数据填充模板 - 从原始单据提取数据并映射到模板结构
export async function extractDataToTemplate(
  fileBase64: string,
  mimeType: string,
  templateStructure: {
    companyInfo: { fields: Array<{ key: string; label: string }> };
    tableHeaders: string[];
    summaryFields: string[];
  }
): Promise<DataExtractionResult> {
  const companyFieldLabels = templateStructure.companyInfo.fields.map(f => f.label).join('、');
  const tableHeadersStr = templateStructure.tableHeaders.join('、');
  const summaryFieldsStr = templateStructure.summaryFields.join('、');

  const prompt = `你是一个专业的单据数据提取助手。请从上传的单据图片中提取数据，并按照指定的模板结构返回 JSON。

目标模板结构：
1. 公司信息区字段: ${companyFieldLabels || '无'}
2. 表格列: ${tableHeadersStr || '无'}
3. 汇总区字段: ${summaryFieldsStr || '无'}

请按以下 JSON 格式返回提取的数据：
{
  "companyInfo": {
    "字段key1": "提取的值1",
    "字段key2": "提取的值2"
  },
  "tableRows": [
    {"列名1": "值", "列名2": "值", ...},
    {"列名1": "值", "列名2": "值", ...}
  ],
  "summary": {
    "汇总字段1": "值",
    "汇总字段2": "值"
  }
}

具体字段映射：
- companyInfo 的 key 使用: ${templateStructure.companyInfo.fields.map(f => `"${f.key}"`).join(', ') || '无'}
- tableRows 每行的 key 使用: ${templateStructure.tableHeaders.map(h => `"${h}"`).join(', ') || '无'}
- summary 的 key 使用: ${templateStructure.summaryFields.map(f => `"${f}"`).join(', ') || '无'}

注意：
- 如果某个字段在原始单据中找不到对应数据，请填写空字符串
- 请尽量智能匹配，即使原始单据的字段名称与模板不完全一致
- 数字类型的值请保持数字格式，不要加单位
- 忽略盖章、签名等非数据内容
- 只返回 JSON，不要返回其他内容`;

  const isPdf = mimeType === 'application/pdf';
  let requestBody;

  if (isPdf) {
    const fileId = await uploadFileToKimi(fileBase64, `source_${Date.now()}.pdf`);
    const fileContent = await getFileContent(fileId);

    requestBody = {
      model: KIMI_TEXT_MODEL,
      messages: [
        {
          role: "system",
          content: fileContent,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 8192,
    };
  } else {
    const imageUrl = `data:${mimeType};base64,${fileBase64}`;
    
    requestBody = {
      model: KIMI_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
      max_tokens: 8192,
    };
  }

  console.log(`[Kimi] 提取数据到模板，使用模型: ${isPdf ? KIMI_TEXT_MODEL : KIMI_VISION_MODEL}`);

  const response = await fetch(KIMI_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${KIMI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Kimi] API 响应错误:", response.status, errorText);
    throw new Error(`Kimi API 请求失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  
  if (!text) {
    throw new Error("Kimi 未返回有效响应");
  }

  console.log("[Kimi] 数据提取响应:", text.substring(0, 500));

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Kimi 未能返回有效的结构化数据");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      companyInfo: parsed.companyInfo || {},
      tableRows: parsed.tableRows || [],
      summary: parsed.summary || {},
    };
  } catch {
    throw new Error("Kimi 返回的数据无法解析");
  }
}
