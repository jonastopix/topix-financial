import { FileText, Download, X, Image as ImageIcon, Loader2, AlertTriangle } from "lucide-react";
import { useChatAttachmentUrl } from "@/hooks/useChatAttachmentUrl";

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

/** Single attachment row/image — fetches its own signed URL via the hook. */
function ChatAttachmentItem({
  attachment,
  attachmentIndex,
  messageId,
  source,
  isMine,
}: {
  attachment: ChatAttachment;
  attachmentIndex: number;
  messageId: string;
  source: "messages" | "group_messages";
  isMine: boolean;
}) {
  const { url, isLoading, isError, refetch } = useChatAttachmentUrl({
    source,
    messageId,
    attachmentIndex,
  });
  const isImage = IMAGE_TYPES.includes(attachment.type);

  if (isImage) {
    if (isLoading) {
      return (
        <div
          className="max-w-[280px] h-[160px] bg-muted animate-pulse rounded-lg"
          aria-label="Indlæser billede"
        />
      );
    }
    if (isError || !url) {
      return (
        <div className="max-w-[280px] h-[160px] rounded-lg border border-border bg-muted/40 flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4" />
          <span>Kunne ikke indlæse billede</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-[11px] underline hover:text-foreground"
          >
            Prøv igen
          </button>
        </div>
      );
    }
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-lg overflow-hidden max-w-[280px]"
      >
        <img
          src={url}
          alt={attachment.name}
          className="w-full h-auto max-h-[200px] object-cover rounded-lg"
          loading="lazy"
        />
      </a>
    );
  }

  // File variant — render row with known name/size immediately; only the
  // trailing icon reflects URL load state.
  const baseRow = `flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
    isMine
      ? "bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground"
      : "bg-muted hover:bg-muted/80 text-foreground"
  }`;

  if (isError) {
    return (
      <button
        type="button"
        onClick={() => refetch()}
        title="Kunne ikke hente vedhæftning — klik for at prøve igen"
        className={`${baseRow} w-full text-left`}
      >
        <FileText className="h-4 w-4 shrink-0" />
        <span className="truncate flex-1">{attachment.name}</span>
        <span className="text-[10px] opacity-60 shrink-0">
          {formatFileSize(attachment.size)}
        </span>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </button>
    );
  }

  if (isLoading || !url) {
    return (
      <div
        className={`${baseRow} opacity-80`}
        aria-label="Indlæser vedhæftning"
      >
        <FileText className="h-4 w-4 shrink-0" />
        <span className="truncate flex-1">{attachment.name}</span>
        <span className="text-[10px] opacity-60 shrink-0">
          {formatFileSize(attachment.size)}
        </span>
        <Loader2 className="h-3.5 w-3.5 shrink-0 opacity-60 animate-spin" />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={baseRow}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate flex-1">{attachment.name}</span>
      <span className="text-[10px] opacity-60 shrink-0">
        {formatFileSize(attachment.size)}
      </span>
      <Download className="h-3.5 w-3.5 shrink-0 opacity-60" />
    </a>
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
      {attachments.map((att, i) => (
        <ChatAttachmentItem
          key={i}
          attachment={att}
          attachmentIndex={i}
          messageId={messageId}
          source={source}
          isMine={isMine}
        />
      ))}
    </div>
  );
}
