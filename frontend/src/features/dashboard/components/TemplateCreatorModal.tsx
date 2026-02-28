"use client";

import { useState, useCallback } from "react";
import { CustomTemplate, TemplateType, TemplateField, TemplateRecognitionResult, ACCEPTED_EXTENSIONS, MAX_FILE_SIZE } from "@/features/documents/types";
import { saveTemplate, generateTemplateId } from "@/features/templates/storage/templateStorage";

interface TemplateCreatorModalProps {
  isOpen: boolean;
  category: TemplateType;
  categoryName: string;
  onClose: () => void;
  onSaved: (template: CustomTemplate) => void;
}

type ModalStep = "upload" | "recognizing" | "preview";

export default function TemplateCreatorModal({
  isOpen,
  category,
  categoryName,
  onClose,
  onSaved,
}: TemplateCreatorModalProps) {
  const [step, setStep] = useState<ModalStep>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [recognizedStructure, setRecognizedStructure] = useState<TemplateRecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setStep("upload");
    setPreviewImage(null);
    setTemplateName("");
    setRecognizedStructure(null);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const processFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setError("文件大小超过 50MB 限制");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件（JPG、PNG等）");
      return;
    }

    setError(null);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setPreviewImage(dataUrl);
      setStep("recognizing");

      try {
        const base64 = dataUrl.split(",")[1];
        const response = await fetch("/api/template/recognize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileBase64: base64,
            mimeType: file.type,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "识别失败");
        }

        setRecognizedStructure(data);
        setTemplateName(`${categoryName}模板`);
        setStep("preview");
      } catch (err) {
        setError(err instanceof Error ? err.message : "模板识别失败");
        setStep("upload");
      }
    };
    reader.readAsDataURL(file);
  }, [categoryName]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  }, [processFile]);

  const handleFieldLabelChange = (index: number, newLabel: string) => {
    if (!recognizedStructure) return;
    const newFields = [...recognizedStructure.companyInfo.fields];
    newFields[index] = { ...newFields[index], label: newLabel };
    setRecognizedStructure({
      ...recognizedStructure,
      companyInfo: { ...recognizedStructure.companyInfo, fields: newFields },
    });
  };

  const handleHeaderChange = (index: number, newHeader: string) => {
    if (!recognizedStructure) return;
    const newHeaders = [...recognizedStructure.tableHeaders];
    newHeaders[index] = newHeader;
    setRecognizedStructure({
      ...recognizedStructure,
      tableHeaders: newHeaders,
    });
  };

  const handleSummaryFieldChange = (index: number, newField: string) => {
    if (!recognizedStructure) return;
    const newFields = [...recognizedStructure.summaryFields];
    newFields[index] = newField;
    setRecognizedStructure({
      ...recognizedStructure,
      summaryFields: newFields,
    });
  };

  const handleSave = () => {
    if (!recognizedStructure || !templateName.trim()) return;

    const template: CustomTemplate = {
      id: generateTemplateId(),
      name: templateName.trim(),
      category,
      createdAt: new Date().toISOString(),
      previewImage: previewImage || undefined,
      structure: {
        companyInfo: recognizedStructure.companyInfo,
        tableHeaders: recognizedStructure.tableHeaders,
        tableFieldTypes: recognizedStructure.tableFieldTypes,
        summaryFields: recognizedStructure.summaryFields,
      },
    };

    saveTemplate(template);
    onSaved(template);
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">创建{categoryName}模板</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {step === "upload" && "上传您公司的单据截图作为模板"}
              {step === "recognizing" && "AI 正在识别表单结构..."}
              {step === "preview" && "确认识别结果并保存模板"}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {error}
            </div>
          )}

          {step === "upload" && (
            <div
              className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
                isDragging
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="text-slate-600 mb-2">拖拽图片到这里，或</p>
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-all">
                  选择文件
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-slate-400 mt-4">支持 JPG、PNG 格式，最大 50MB</p>
            </div>
          )}

          {step === "recognizing" && (
            <div className="py-12 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-600 to-purple-500 flex items-center justify-center animate-pulse">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
                  <path d="M8.25 9.93A4 4 0 0 1 12 2" />
                  <path d="M12 22a4 4 0 0 1-4-4c0-1.95 1.4-3.58 3.25-3.93" />
                  <path d="M15.75 14.07A4 4 0 0 1 12 22" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">AI 正在识别模板结构</h3>
              <p className="text-sm text-slate-400">正在分析表头、字段类型和表单布局...</p>
              {previewImage && (
                <div className="mt-6">
                  <img src={previewImage} alt="模板预览" className="max-h-32 mx-auto rounded-lg border border-slate-200" />
                </div>
              )}
            </div>
          )}

          {step === "preview" && recognizedStructure && (
            <div className="space-y-6">
              {/* Template name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">模板名称</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="输入模板名称"
                />
              </div>

              {/* Preview image */}
              {previewImage && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">原始截图</label>
                  <img src={previewImage} alt="模板预览" className="max-h-40 rounded-lg border border-slate-200" />
                </div>
              )}

              {/* Company info fields */}
              {recognizedStructure.companyInfo.fields.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    公司信息字段 ({recognizedStructure.companyInfo.fields.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {recognizedStructure.companyInfo.fields.map((field, i) => (
                      <input
                        key={i}
                        type="text"
                        value={field.label}
                        onChange={(e) => handleFieldLabelChange(i, e.target.value)}
                        className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Table headers */}
              {recognizedStructure.tableHeaders.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    表格列 ({recognizedStructure.tableHeaders.length})
                  </label>
                  <div className="overflow-x-auto">
                    <div className="flex gap-2 pb-2">
                      {recognizedStructure.tableHeaders.map((header, i) => (
                        <div key={i} className="flex flex-col gap-1">
                          <input
                            type="text"
                            value={header}
                            onChange={(e) => handleHeaderChange(i, e.target.value)}
                            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-24"
                          />
                          <span className="text-xs text-slate-400 text-center">
                            {recognizedStructure.tableFieldTypes[i] || "text"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Summary fields */}
              {recognizedStructure.summaryFields.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    汇总字段 ({recognizedStructure.summaryFields.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {recognizedStructure.summaryFields.map((field, i) => (
                      <input
                        key={i}
                        type="text"
                        value={field}
                        onChange={(e) => handleSummaryFieldChange(i, e.target.value)}
                        className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-28"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "preview" && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              onClick={resetState}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              重新上传
            </button>
            <button
              onClick={handleSave}
              disabled={!templateName.trim()}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              保存模板
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
