import { FileText, Download, X, Image as ImageIcon } from "lucide-react";
import { getChatAttachmentDisplayUrl } from "@/lib/chatAttachments";

export interface ChatAttachment {
  name: string;
  url: string;
  type: string; // MIME type
  size: number;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Preview strip shown below the input while composing */
export function AttachmentPreviewStrip({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="flex gap-2 px-3 py-2 overflow-x-auto border-t border-border">
      {files.map((file, i) => {
        const isImage = IMAGE_TYPES.includes(file.type);
        return (
          <div
            key={`${file.name}-${i}`}
            className="relative shrink-0 group rounded-lg border border-border bg-background overflow-hidden"
          >
            {isImage ? (
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="h-16 w-16 object-cover"
              />
            ) : (
              <div className="h-16 w-16 flex flex-col items-center justify-center gap-1 px-1">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground truncate w-full text-center">
                  {file.name.split(".").pop()?.toUpperCase()}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
              <p className="text-[8px] text-white truncate">{file.name}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Renders attachments inside a sent message bubble */
export function MessageAttachments({
  attachments,
  isMine,
  messageId,
  source,
}: {
  attachments: ChatAttachment[];
  isMine: boolean;
  messageId: string;
  source: "messages" | "group_messages";
}) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 mt-1.5">
      {attachments.map((att, i) => {
        const isImage = IMAGE_TYPES.includes(att.type);
        const displayUrl = getChatAttachmentDisplayUrl({
          source,
          messageId,
          attachmentIndex: i,
          legacyUrl: att.url,
        });

        if (isImage) {
          return (
            <a
              key={i}
              href={displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg overflow-hidden max-w-[280px]"
            >
              <img
                src={displayUrl}
                alt={att.name}
                className="w-full h-auto max-h-[200px] object-cover rounded-lg"
                loading="lazy"
              />
            </a>
          );
        }

        return (
          <a
            key={i}
            href={displayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
              isMine
                ? "bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted hover:bg-muted/80 text-foreground"
            }`}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate flex-1">{att.name}</span>
            <span className="text-[10px] opacity-60 shrink-0">
              {formatFileSize(att.size)}
            </span>
            <Download className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </a>
        );
      })}
    </div>
  );
}
