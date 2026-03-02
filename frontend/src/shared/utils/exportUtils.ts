import * as XLSX from 'xlsx';
import { CustomTemplate, FilledFormData, ProcessResult } from "@/features/documents/types";
import {
  buildLayoutWritePlan,
  buildLayoutPreviewGrid,
  shouldUseLayoutExport,
} from "@/shared/utils/layoutExport.mjs";

export type ExportFormat = 'excel' | 'csv' | 'json';

// Export filled form data to Excel
export function exportFilledFormToExcel(
  template: CustomTemplate,
  formData: FilledFormData,
  filename?: string
): void {
  const wb = XLSX.utils.book_new();

  // Phase 4 skeleton: when template layout is available, include a write-plan sheet
  // that can later be upgraded to true coordinate/cell fill.
  if (shouldUseLayoutExport(template)) {
    const layoutPlan = buildLayoutWritePlan(template.templateLayout, formData);
    const preview = buildLayoutPreviewGrid(layoutPlan);
    const wsPreview = XLSX.utils.aoa_to_sheet(preview.matrix);
    wsPreview["!cols"] = preview.colWidths;
    wsPreview["!rows"] = preview.rowHeights;
    XLSX.utils.book_append_sheet(wb, wsPreview, "版式回填预览");

    const wsLayout = XLSX.utils.json_to_sheet(
      layoutPlan.map((item: {
        key: string;
        label: string;
        value: string;
        x: number | null;
        y: number | null;
        w: number | null;
        h: number | null;
        confidence: number;
      }) => ({
        字段Key: item.key,
        字段名: item.label,
        值: item.value,
        X: item.x,
        Y: item.y,
        W: item.w,
        H: item.h,
        置信度: item.confidence,
      }))
    );
    XLSX.utils.book_append_sheet(wb, wsLayout, '布局回填计划');
  }
  
  // Sheet 1: Company Info
  if (template.structure.companyInfo.fields.length > 0) {
    const companyData = template.structure.companyInfo.fields.map(field => ({
      '字段': field.label,
      '值': formData.companyInfo[field.key] || ''
    }));
    const wsCompany = XLSX.utils.json_to_sheet(companyData);
    XLSX.utils.book_append_sheet(wb, wsCompany, '基本信息');
  }
  
  // Sheet 2: Table Data (main sheet)
  if (template.structure.tableHeaders.length > 0 && formData.tableRows.length > 0) {
    const tableData = formData.tableRows.map((row, index) => {
      const rowData: Record<string, string | number> = { '序号': index + 1 };
      template.structure.tableHeaders.forEach(header => {
        rowData[header] = row[header] || '';
      });
      return rowData;
    });
    const wsTable = XLSX.utils.json_to_sheet(tableData);
    
    // Set column widths
    const colWidths = [{ wch: 6 }]; // 序号列
    template.structure.tableHeaders.forEach(() => {
      colWidths.push({ wch: 15 });
    });
    wsTable['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(wb, wsTable, '明细数据');
  }
  
  // Sheet 3: Summary
  if (template.structure.summaryFields.length > 0) {
    const summaryData = template.structure.summaryFields.map(field => ({
      '字段': field,
      '值': formData.summary[field] || ''
    }));
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, '汇总信息');
  }
  
  // Generate filename
  const date = new Date().toISOString().split('T')[0];
  const exportFilename = filename || `${template.name}_${date}.xlsx`;
  
  // Download
  XLSX.writeFile(wb, exportFilename);
}

// Export ProcessResult to Excel
export function exportProcessResultToExcel(
  result: ProcessResult,
  templateName?: string
): void {
  const wb = XLSX.utils.book_new();
  
  // Sheet 1: Summary info
  if (result.summary) {
    const summaryData = Object.entries(result.summary)
      .filter(([, value]) => value)
      .map(([key, value]) => ({
        '字段': translateSummaryKey(key),
        '值': value
      }));
    if (summaryData.length > 0) {
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, '摘要信息');
    }
  }
  
  // Sheet 2: Table data
  if (result.headers.length > 0 && result.rows.length > 0) {
    const tableData = result.rows.map((row, index) => {
      const rowData: Record<string, string | number> = { '序号': index + 1 };
      result.headers.forEach(header => {
        rowData[header] = row[header] || '';
      });
      return rowData;
    });
    const wsTable = XLSX.utils.json_to_sheet(tableData);
    
    // Set column widths
    const colWidths = [{ wch: 6 }];
    result.headers.forEach(() => {
      colWidths.push({ wch: 15 });
    });
    wsTable['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(wb, wsTable, '明细数据');
  }
  
  // Generate filename
  const date = new Date().toISOString().split('T')[0];
  const filename = `${templateName || '财务表单'}_${date}.xlsx`;
  
  XLSX.writeFile(wb, filename);
}

// Export to CSV
export function exportToCSV(
  headers: string[],
  rows: Record<string, string>[],
  filename: string
): void {
  const headerLine = headers.join(',');
  const dataLines = rows.map(row => 
    headers.map(h => `"${(row[h] || '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  
  const csv = '\uFEFF' + headerLine + '\n' + dataLines;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

// Export to JSON
export function exportToJSON(data: object, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, filename);
}

// Helper: Download blob
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper: Translate summary keys to Chinese
function translateSummaryKey(key: string): string {
  const map: Record<string, string> = {
    totalAmount: '总金额',
    documentDate: '单据日期',
    supplier: '供应商/客户',
    documentType: '单据类型',
    documentNumber: '单据编号',
    contact: '联系电话',
    address: '地址',
  };
  return map[key] || key;
}

// Get recommended export format based on data type
export function getRecommendedFormat(hasTableData: boolean): ExportFormat {
  return hasTableData ? 'excel' : 'json';
}
