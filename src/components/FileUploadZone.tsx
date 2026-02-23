import { useCallback, useState, useRef } from "react";
import { Upload, FileSpreadsheet, X, CheckCircle2 } from "lucide-react";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: Date;
}

interface FileUploadZoneProps {
  title: string;
  description: string;
  accept?: string;
  onFilesAdded?: (files: File[]) => void;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const FileUploadZone = ({
  title,
  description,
  accept = ".xlsx,.xls,.csv,.pdf",
  onFilesAdded,
}: FileUploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const newFiles: UploadedFile[] = fileArray.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        size: f.size,
        type: f.type,
        uploadedAt: new Date(),
      }));
      setUploadedFiles((prev) => [...prev, ...newFiles]);
      onFilesAdded?.(fileArray);
    },
    [onFilesAdded]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleClick = () => inputRef.current?.click();

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="glass-card rounded-xl p-5 animate-fade-in">
      <h3 className="font-display font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground mb-4">{description}</p>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all duration-200 ${
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/40 hover:bg-secondary/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div
          className={`p-3 rounded-xl mb-3 transition-colors ${
            isDragging ? "bg-primary/10" : "bg-muted"
          }`}
        >
          <Upload
            className={`h-6 w-6 transition-colors ${
              isDragging ? "text-primary" : "text-muted-foreground"
            }`}
          />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">
          {isDragging ? "Slip filen her..." : "Træk og slip filer her"}
        </p>
        <p className="text-xs text-muted-foreground">
          eller <span className="text-primary font-medium">klik for at vælge</span>
        </p>
        <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wider">
          Excel, CSV eller PDF
        </p>
      </div>

      {/* Uploaded files */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 group animate-fade-in"
            >
              <div className="p-2 rounded-lg bg-primary/10">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                </p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(file.id);
                }}
                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUploadZone;
