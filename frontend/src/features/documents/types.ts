export interface UploadedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  preview?: string;
}

export type TemplateType =
  | "delivery_note"
  | "reconciliation"
  | "purchase_order"
  | "bank_statement"
  | "payment_list"
  | "quotation";

export interface TemplateOption {
  id: TemplateType;
  name: string;
  icon: string;
  category: "sales" | "finance";
}

export const TEMPLATES: TemplateOption[] = [
  { id: "delivery_note", name: "送货单", icon: "📦", category: "sales" },
  { id: "reconciliation", name: "对账单", icon: "📋", category: "sales" },
  { id: "purchase_order", name: "采购单", icon: "🛒", category: "sales" },
  { id: "quotation", name: "报价单", icon: "💰", category: "sales" },
  { id: "bank_statement", name: "流水对账", icon: "🏦", category: "finance" },
  { id: "payment_list", name: "支付清单", icon: "💳", category: "finance" },
];

export interface ProcessResult {
  headers: string[];
  rows: Record<string, string>[];
  summary?: {
    totalAmount?: string;
    documentDate?: string;
    supplier?: string;
    documentType?: string;
    documentNumber?: string;
  };
  rawText?: string;
}

export type AppStep = 
  | "upload" 
  | "processing" 
  | "result"
  | "createTemplate"
  | "recognizingTemplate"
  | "previewTemplate"
  | "extractingData"
  | "editForm";

// 模板字段定义
export interface TemplateField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date';
  required: boolean;
}

// 自定义模板结构
export interface CustomTemplate {
  id: string;
  name: string;
  category: TemplateType;
  createdAt: string;
  previewImage?: string;
  structure: {
    companyInfo: {
      fields: TemplateField[];
    };
    tableHeaders: string[];
    tableFieldTypes: string[];
    summaryFields: string[];
  };
}

// 填充后的表单数据
export interface FilledFormData {
  companyInfo: Record<string, string>;
  tableRows: Record<string, string>[];
  summary: Record<string, string>;
}

// 模板识别结果
export interface TemplateRecognitionResult {
  companyInfo: {
    fields: TemplateField[];
  };
  tableHeaders: string[];
  tableFieldTypes: string[];
  summaryFields: string[];
}

// 数据提取结果
export interface DataExtractionResult {
  companyInfo: Record<string, string>;
  tableRows: Record<string, string>[];
  summary: Record<string, string>;
}

export const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx";

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function getFileTypeLabel(type: string): string {
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "image/jpeg": "JPG",
    "image/jpg": "JPG",
    "image/png": "PNG",
    "application/msword": "DOC",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/vnd.ms-excel": "XLS",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  };
  return map[type] || "FILE";
}

export function getFileTypeColor(type: string): string {
  const label = getFileTypeLabel(type);
  const map: Record<string, string> = {
    PDF: "bg-red-100 text-red-600",
    DOC: "bg-blue-100 text-blue-600",
    DOCX: "bg-blue-100 text-blue-600",
    JPG: "bg-orange-100 text-orange-600",
    PNG: "bg-green-100 text-green-600",
    XLS: "bg-emerald-100 text-emerald-700",
    XLSX: "bg-emerald-100 text-emerald-700",
  };
  return map[label] || "bg-gray-100 text-gray-600";
}
