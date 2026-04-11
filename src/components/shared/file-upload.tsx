"use client";

import { useRef, useState } from "react";
import { Upload, X, FileText, Image, Loader2 } from "lucide-react";
import { BUCKETS } from "@/lib/minio-constants";

type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

interface FileUploadProps {
  bucket?: BucketName;
  folder?: string;
  accept?: string;
  maxSizeMB?: number;
  onUploaded: (result: { url: string; bucket: string; objectName: string; fileName: string }) => void;
  onError?: (message: string) => void;
  className?: string;
  label?: string;
  currentUrl?: string;
}

export function FileUpload({
  bucket = BUCKETS.HR_DOCUMENTS,
  folder = "misc",
  accept,
  maxSizeMB = 10,
  onUploaded,
  onError,
  className = "",
  label = "Tải file lên",
  currentUrl,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const [fileName, setFileName] = useState<string | null>(null);

  const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(name);

  async function upload(file: File) {
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      onError?.(`File không được vượt quá ${maxSizeMB}MB`);
      return;
    }

    setUploading(true);
    setProgress(0);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("bucket", bucket);
    formData.append("folder", folder);

    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/v1/upload");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText);
          if (xhr.status < 200 || xhr.status >= 300 || json.error) {
            onError?.(json.error?.message || "Upload thất bại");
          } else {
            setFileName(json.data.fileName);
            setPreview(isImage(json.data.fileName) ? json.data.url : null);
            onUploaded(json.data);
          }
        } catch {
          onError?.("Phản hồi không hợp lệ");
        }
        setUploading(false);
        setProgress(0);
        resolve();
      };

      xhr.onerror = () => {
        onError?.("Không thể kết nối máy chủ");
        setUploading(false);
        setProgress(0);
        resolve();
      };

      xhr.send(formData);
    });
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    upload(files[0]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function handleClear() {
    setPreview(null);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Drop zone */}
      <div
        className={`relative border-2 border-dashed rounded-lg transition-colors cursor-pointer
          ${dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400 bg-gray-50"}
          ${uploading ? "pointer-events-none opacity-60" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {/* Preview if image */}
        {preview ? (
          <div className="p-3 flex items-center gap-3">
            <img src={preview} alt="preview" className="h-16 w-16 object-cover rounded" />
            <span className="text-sm text-gray-600 truncate flex-1">{fileName || "Đã tải lên"}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ) : fileName ? (
          <div className="p-3 flex items-center gap-3">
            <FileText size={32} className="text-gray-400 shrink-0" />
            <span className="text-sm text-gray-600 truncate flex-1">{fileName}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="p-6 flex flex-col items-center gap-2 text-center">
            {uploading ? (
              <Loader2 size={24} className="text-blue-500 animate-spin" />
            ) : (
              <Upload size={24} className="text-gray-400" />
            )}
            <p className="text-sm text-gray-500">
              {uploading ? "Đang tải lên..." : label}
            </p>
            <p className="text-xs text-gray-400">Kéo thả hoặc click để chọn • Tối đa {maxSizeMB}MB</p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {uploading && progress > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Đang tải lên...</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${progress}%`, background: "#3b82f6" }}
            />
          </div>
        </div>
      )}

      {/* Show current URL link if no new file selected */}
      {currentUrl && !fileName && (
        <a
          href={currentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <Image size={12} />
          Xem file hiện tại
        </a>
      )}
    </div>
  );
}
