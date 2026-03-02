"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/features/dashboard/components/Sidebar";
import UploadZone from "@/features/dashboard/components/UploadZone";
import TemplateSelector from "@/features/dashboard/components/TemplateSelector";
import StatusBar from "@/features/dashboard/components/StatusBar";
import UploadModal from "@/features/dashboard/components/UploadModal";
import ResultView from "@/features/dashboard/components/ResultView";
import DownloadModal from "@/features/dashboard/components/DownloadModal";
import TemplateCreatorModal from "@/features/dashboard/components/TemplateCreatorModal";
import EditableForm from "@/features/dashboard/components/EditableForm";
import { buildNonJsonApiError, parseJsonSafely } from "@/lib/http";
import { 
  UploadedFile, 
  TemplateType, 
  ProcessResult, 
  AppStep, 
  CustomTemplate,
  FilledFormData 
} from "@/features/documents/types";

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("document");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedType, setSelectedType] = useState<TemplateType | null>(null);
  const [selectedCustomTemplate, setSelectedCustomTemplate] = useState<CustomTemplate | null>(null);
  const [step, setStep] = useState<AppStep>("upload");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showTemplateCreator, setShowTemplateCreator] = useState(false);
  const [templateCreatorCategory, setTemplateCreatorCategory] = useState<TemplateType>("quotation");
  const [templateCreatorCategoryName, setTemplateCreatorCategoryName] = useState("报价单");
  const [error, setError] = useState<string | null>(null);
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0);
  const [filledFormData, setFilledFormData] = useState<FilledFormData | null>(null);
  const [allowSemanticFallback, setAllowSemanticFallback] = useState(true);
  const [extractDiagnostics, setExtractDiagnostics] = useState<{
    extractionMode?: string;
    transformQuality?: {
      inlierRatio?: number;
      reprojectionErrorPx?: number;
      matchCount?: number;
      inlierCount?: number;
      failures?: string[];
    };
  } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isLoggedIn = localStorage.getItem("is_logged_in");
      if (!isLoggedIn) {
        router.push("/");
      }
    }
  }, [router]);

  const handleFilesAdded = useCallback((newFiles: UploadedFile[]) => {
    setFiles(newFiles.slice(0, 1));
    setError(null);
    setExtractDiagnostics(null);
  }, []);

  const handleFileRemove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleCreateTemplate = useCallback((category: TemplateType, categoryName: string) => {
    setTemplateCreatorCategory(category);
    setTemplateCreatorCategoryName(categoryName);
    setShowTemplateCreator(true);
  }, []);

  const handleTemplateSaved = useCallback((template: CustomTemplate) => {
    setTemplateRefreshKey((k) => k + 1);
    setSelectedCustomTemplate(template);
    setSelectedType(null);
  }, []);

  const handleSelectCustomTemplate = useCallback((template: CustomTemplate) => {
    setSelectedCustomTemplate(template);
    setSelectedType(null);
    setError(null);
    setExtractDiagnostics(null);
  }, []);

  const handleSelectType = useCallback((type: TemplateType) => {
    setSelectedType(type);
    setSelectedCustomTemplate(null);
    setExtractDiagnostics(null);
  }, []);

  const handleGenerate = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setError(null);
    setExtractDiagnostics(null);

    try {
      const file = files[0].file;
      const base64 = await fileToBase64(file);

      if (selectedCustomTemplate) {
        setStep("extractingData");
        
        const response = await fetch("/api/template/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileBase64: base64,
            mimeType: file.type,
            templateStructure: {
              companyInfo: selectedCustomTemplate.structure.companyInfo,
              tableHeaders: selectedCustomTemplate.structure.tableHeaders,
              summaryFields: selectedCustomTemplate.structure.summaryFields,
            },
            templateLayout: selectedCustomTemplate.templateLayout || null,
            allowSemanticFallback,
            ocrTokens: [],
          }),
        });

        const { data, text, isJson } = await parseJsonSafely(response);

        if (!isJson) {
          throw new Error(buildNonJsonApiError(response, text));
        }
        const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
        const transformQuality =
          payload.transformQuality && typeof payload.transformQuality === "object"
            ? (payload.transformQuality as {
                inlierRatio?: number;
                reprojectionErrorPx?: number;
                matchCount?: number;
                inlierCount?: number;
                failures?: string[];
              })
            : undefined;

        if (!response.ok) {
          if (response.status === 422 && transformQuality) {
            const failures = Array.isArray(transformQuality.failures)
              ? transformQuality.failures.join(", ")
              : "unknown";
            const matchCount = Number(transformQuality.matchCount || 0);
            const inlierRatio = Number(transformQuality.inlierRatio || 0);
            const reproj = Number(transformQuality.reprojectionErrorPx || 0);
            throw new Error(
              `对齐失败：匹配锚点 ${matchCount}，内点率 ${(inlierRatio * 100).toFixed(1)}%，重投影误差 ${reproj.toFixed(2)}px。原因: ${failures}`
            );
          }
          throw new Error((payload.error as string) || "数据提取失败");
        }

        setExtractDiagnostics({
          extractionMode:
            typeof payload.extractionMode === "string" ? payload.extractionMode : undefined,
          transformQuality,
        });

        setFilledFormData({
          companyInfo: (payload.companyInfo as Record<string, string>) || {},
          tableRows: (payload.tableRows as Record<string, string>[]) || [],
          summary: (payload.summary as Record<string, string>) || {},
        });
        setStep("editForm");
      } else if (selectedType) {
        setStep("processing");

        const response = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileBase64: base64,
            mimeType: file.type,
            templateType: selectedType,
          }),
        });

        const { data, text, isJson } = await parseJsonSafely(response);

        if (!isJson) {
          throw new Error(buildNonJsonApiError(response, text));
        }
        const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : {};

        if (!response.ok) {
          throw new Error((payload.error as string) || "处理失败");
        }

        setResult(payload as unknown as ProcessResult);
        setStep("result");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "处理失败，请重试");
      setStep("upload");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBack = () => {
    setStep("upload");
    setResult(null);
    setFilledFormData(null);
    setExtractDiagnostics(null);
  };

  const handleFormDataChange = useCallback((data: FilledFormData) => {
    setFilledFormData(data);
  }, []);

  const templateSelected = selectedCustomTemplate !== null || selectedType !== null;

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-8 py-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"
                  fill="#2563eb"
                />
              </svg>
              <h1 className="text-xl font-bold text-slate-800">
                {step === "editForm" ? "编辑表单" : "上传与识别"}
              </h1>
            </div>
            <p className="text-sm text-slate-400">
              {step === "editForm" 
                ? "编辑AI提取的数据，完成后可导出下载" 
                : "选择模板后上传原始单据，AI自动提取数据生成标准化文件"}
            </p>
          </div>
          {step !== "editForm" && (
            <button className="px-4 py-2 bg-blue-50 text-blue-600 text-sm font-semibold rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              免费试用
            </button>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto p-8">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-center gap-2 animate-fade-in">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {error}
            </div>
          )}
          {extractDiagnostics?.extractionMode === "semantic_fallback" && (
            <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
              当前提取模式: 语义降级。原因: 模板对齐质量不足，本次未使用坐标对齐，仅按语义字段提取。
            </div>
          )}
          {extractDiagnostics?.transformQuality && (
            <div className="mb-4 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
              对齐诊断: 锚点 {extractDiagnostics.transformQuality.inlierCount || 0}/
              {extractDiagnostics.transformQuality.matchCount || 0}，内点率{" "}
              {((extractDiagnostics.transformQuality.inlierRatio || 0) * 100).toFixed(1)}%，
              重投影误差 {(extractDiagnostics.transformQuality.reprojectionErrorPx || 0).toFixed(2)}px
            </div>
          )}

          {step === "editForm" && selectedCustomTemplate && filledFormData ? (
            <EditableForm
              template={selectedCustomTemplate}
              initialData={filledFormData}
              onDataChange={handleFormDataChange}
              onBack={handleBack}
            />
          ) : step === "result" && result ? (
            <ResultView result={result} files={files} onBack={handleBack} />
          ) : step === "processing" || step === "extractingData" ? (
            <ProcessingView isExtracting={step === "extractingData"} />
          ) : (
            <div className="flex gap-8 h-full">
              <UploadZone
                files={files}
                onFilesAdded={handleFilesAdded}
                onFileRemove={handleFileRemove}
                onUploadClick={() => setShowUploadModal(true)}
              />
              <TemplateSelector
                selectedType={selectedType}
                selectedCustomTemplate={selectedCustomTemplate}
                onSelectType={handleSelectType}
                onSelectCustomTemplate={handleSelectCustomTemplate}
                onCreateTemplate={handleCreateTemplate}
                refreshKey={templateRefreshKey}
              />
            </div>
          )}
          {step === "upload" && selectedCustomTemplate && (
            <div className="mt-4 px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-700">对齐失败时语义降级</p>
                <p className="text-xs text-slate-500">
                  开启后，若坐标对齐失败仍继续提取数据，但不保证版式坐标准确。
                </p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowSemanticFallback}
                  onChange={(e) => setAllowSemanticFallback(e.target.checked)}
                />
                <span className="text-xs text-slate-700">允许降级</span>
              </label>
            </div>
          )}
        </div>

        {/* Status bar */}
        {step !== "editForm" && (
          <StatusBar
            fileCount={files.length}
            step={step}
            templateSelected={templateSelected}
            onGenerate={handleGenerate}
            onDownload={() => setShowDownloadModal(true)}
            isProcessing={isProcessing}
          />
        )}
      </div>

      {/* Modals */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onFilesAdded={handleFilesAdded}
      />
      <DownloadModal
        isOpen={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
        result={result}
      />
      <TemplateCreatorModal
        isOpen={showTemplateCreator}
        category={templateCreatorCategory}
        categoryName={templateCreatorCategoryName}
        onClose={() => setShowTemplateCreator(false)}
        onSaved={handleTemplateSaved}
      />
    </div>
  );
}

function ProcessingView({ isExtracting = false }: { isExtracting?: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
      <div className="relative w-24 h-24 mb-6">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-600 to-purple-500 flex items-center justify-center animate-pulse-ring">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
            <path d="M8.25 9.93A4 4 0 0 1 12 2" />
            <path d="M12 22a4 4 0 0 1-4-4c0-1.95 1.4-3.58 3.25-3.93" />
            <path d="M15.75 14.07A4 4 0 0 1 12 22" />
          </svg>
        </div>
        <div className="absolute -inset-4 rounded-full border border-blue-200 animate-spin-slow" />
        <div className="absolute -inset-8 rounded-full border border-dashed border-blue-100" style={{ animation: "spin-slow 12s linear infinite reverse" }} />
      </div>

      <h3 className="text-lg font-bold text-slate-700 mb-2">
        {isExtracting ? "AI 正在提取数据..." : "AI 正在解析文档..."}
      </h3>
      <p className="text-sm text-slate-400 mb-6">
        {isExtracting 
          ? "正在从原始单据提取数据并映射到模板字段" 
          : "正在识别文档结构、提取关键数据并生成标准化表单"}
      </p>

      <div className="w-64">
        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-purple-500" style={{ animation: "progress-bar 8s ease-in-out infinite" }} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-center mt-6">
        {(isExtracting 
          ? ["字段匹配", "数据提取", "格式转换", "数值解析", "智能填充"]
          : ["表头识别", "金额提取", "日期解析", "供应商匹配", "格式标准化"]
        ).map((chip, i) => (
          <span
            key={i}
            className="text-xs font-medium px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 animate-fade-in"
            style={{ animationDelay: `${i * 200}ms` }}
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
