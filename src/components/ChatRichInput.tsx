import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, List, ListOrdered, Link as LinkIcon, Paperclip, Send, Loader2, Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { AttachmentPreviewStrip } from "@/components/ChatAttachments";
import { useChatHenvisninger } from "@/components/chatHenvisninger";
import { chatAfsendelse } from "@/lib/chatDokument";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,image/gif,.pdf,.xlsx,.xls,.csv,.doc,.docx";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

interface ChatRichInputProps {
  /** `dokument` (29/9-2026, «#» i chatten) er editorens JSON — KUN når
      beskeden bærer en #-henvisning; ellers undefined, og `html` er
      tegn for tegn det samme som før (chatAfsendelse). Panerne bygger
      content + indhold_json af dokumentet gennem byggChatBesked. */
  onSubmit: (html: string, files?: File[], dokument?: Record<string, unknown>) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  onRequestSubmit?: (fn: () => void) => void;
  /** When true, render compact inner-send pill (used on mobile by default). */
  compact?: boolean;
  /** When true, show inner send button. Defaults to compact value. */
  showInnerSend?: boolean;
  /** variant="hb" (C4): Hjemmebane-udtrykket — hvid flade på papir,
      hb-line, evergreen som handlingsfarve, tegn-tælleren i rust ved
      loftet (advarsel). Uden variant er alt tegn-for-tegn som før
      (rådgiverens mørke composer er urørt). */
  variant?: "hb";
  /** Kameraknappen (videosvar, 29/9-2026). VALGFRI — KUN rådgiverens pane
      (CompanyChatPane) sætter den; uden prop er der ingen knap, og
      medlemmets input er tegn-for-tegn som før. Knappen står ved siden af
      vedhæft-knappen, begge steder (værktøjslinjen og den kompakte).
      `fremdrift` (0–100) mens videoen uploades: knappen viser procenten og
      er spærret. Låst af chatVideoFlade.guard. */
  videoKnap?: VideoKnap;
  /** Lavere i hvile (30/9-2026, Jonas: «chatten på virksomhedssiderne er
      lidt for små»): én linje, tre ved fokus, vokser med indholdet. VALGFRI
      — KUN CompanyChatPane i låst tilstand (virksomhedssiden) sætter den;
      gælder kun desktop (ikke den kompakte mobilform). Uden prop er feltet
      tegn-for-tegn som før (10/9: tre linjer at starte på). */
  lavIHvile?: boolean;
}

export interface VideoKnap {
  onClick: () => void;
  fremdrift: number | null;
}

/** Knappens indhold: kameraet, eller procenten mens videoen uploades. */
function VideoKnapIndhold({ videoKnap, stor }: { videoKnap: VideoKnap; stor: boolean }) {
  if (videoKnap.fremdrift !== null) {
    return <span className="text-[10px] font-medium tabular-nums">{videoKnap.fremdrift}%</span>;
  }
  return <Video className={stor ? "h-4 w-4" : "h-3.5 w-3.5"} />;
}

function ToolbarBtn({
  active,
  onClick,
  children,
  title,
  hb,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  hb?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn(
        "p-1 rounded transition-colors",
        active
          ? hb
            ? "bg-hb-evergreen/10 text-hb-evergreen"
            : "bg-primary/15 text-primary"
          : hb
            ? "text-hb-ink-soft hover:text-hb-ink hover:bg-hb-sage/30"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
      )}
    >
      {children}
    </button>
  );
}

const normalizeLinkUrl = (rawUrl: string): string => {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (/^[a-z]+:/i.test(trimmed)) return "";
  return `https://${trimmed.replace(/^\/+/, "")}`;
};

function Toolbar({ editor, onAttach, hb, videoKnap }: { editor: Editor; onAttach: () => void; hb?: boolean; videoKnap?: VideoKnap }) {
  const setLink = useCallback(() => {
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    const existingHref = editor.getAttributes("link").href;
    const inputUrl = window.prompt("Link URL", existingHref || "https://");
    if (inputUrl === null) return;
    if (inputUrl.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    const href = normalizeLinkUrl(inputUrl);
    if (!href) return;

    if (hasSelection) {
      editor.chain().focus().setLink({ href }).run();
    } else if (existingHref) {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    } else {
      const displayText = inputUrl.trim();
      editor.chain().focus().insertContent({
        type: "text",
        text: displayText,
        marks: [{ type: "link", attrs: { href } }],
      }).run();
    }
  }, [editor]);

  return (
    <div className={cn(
      "flex items-center gap-0.5 px-2 py-1 border-b",
      hb ? "border-hb-line bg-hb-sage/10" : "border-border bg-muted/30"
    )}>
      <span className={cn("text-[9px] mr-1 select-none", hb ? "text-hb-ink-soft/60" : "text-muted-foreground/60")}>Formater:</span>
      <ToolbarBtn
        hb={hb}
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Fed (Ctrl+B)"
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        hb={hb}
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Kursiv (Ctrl+I)"
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <div className={cn("w-px h-4 mx-0.5", hb ? "bg-hb-line" : "bg-border")} />
      <ToolbarBtn
        hb={hb}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Punktliste"
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        hb={hb}
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Nummereret liste"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <div className={cn("w-px h-4 mx-0.5", hb ? "bg-hb-line" : "bg-border")} />
      <ToolbarBtn
        hb={hb}
        active={editor.isActive("link")}
        onClick={setLink}
        title="Link"
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <div className={cn("w-px h-4 mx-0.5", hb ? "bg-hb-line" : "bg-border")} />
      <ToolbarBtn
        hb={hb}
        active={false}
        onClick={onAttach}
        title="Vedhæft fil"
      >
        <Paperclip className="h-3.5 w-3.5" />
      </ToolbarBtn>
      {videoKnap && (
        <ToolbarBtn
          hb={hb}
          active={videoKnap.fremdrift !== null}
          onClick={() => { if (videoKnap.fremdrift === null) videoKnap.onClick(); }}
          title={videoKnap.fremdrift !== null ? "Videoen sendes …" : "Optag video"}
        >
          <VideoKnapIndhold videoKnap={videoKnap} stor={false} />
        </ToolbarBtn>
      )}
    </div>
  );
}

const ChatRichInput: React.FC<ChatRichInputProps> = ({
  onSubmit,
  disabled = false,
  placeholder = "Skriv en besked...",
  maxLength = 5000,
  onRequestSubmit,
  compact,
  showInnerSend,
  variant,
  videoKnap,
  lavIHvile = false,
}) => {
  const hb = variant === "hb";
  const isMobile = useIsMobile();
  const isCompact = compact ?? isMobile;
  const renderInnerSend = showInnerSend ?? isCompact;

  const editorRef = useRef<Editor | null>(null);
  const submitRef = useRef<() => void>(() => {});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback((incoming: File[]) => {
    const valid = incoming.filter(f => {
      if (f.size > MAX_FILE_SIZE) {
        console.warn(`File ${f.name} exceeds max size`);
        return false;
      }
      return true;
    });
    setPendingFiles(prev => [...prev, ...valid].slice(0, MAX_FILES));
  }, []);

  // Flag to prevent double-add from Tiptap handleDrop + wrapper onDrop
  const dropHandledRef = useRef(false);

  // «#» (29/9-2026): events, lektioner og rabataftaler — chatHenvisninger.ts.
  const henvisninger = useChatHenvisninger();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        hardBreak: { keepMarks: true },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder }),
      ...henvisninger,
    ],
    editorProps: {
      attributes: {
        class: cn(
          // MOBIL (Jonas 29/9): iOS Safari zoomer ind ved fokus på felter under
          // 16 px (målt computed 14 px her). 16 px + linjehøjde 20 px (leading-5)
          // holder de tre linjers højde (3 × 20 + 20 = 80) uændret — Jonas'
          // beslutning 10/9 om min-h røres ikke. Breakpointet er md, samme som
          // useIsMobile (768); desktop er uændret.
          "px-3 text-sm max-md:text-[16px] max-md:leading-5 focus:outline-none overflow-y-auto",
          hb ? "text-hb-ink" : "text-foreground",
          // Størrelsen (Jonas 10/9): tre linjer at starte på — text-sm har
          // linjehøjde 20 px, så 3 × 20 + lodret padding (16/20) = 76/80 px —
          // og omkring en tredjedel af skærmen før feltet ruller (33vh, som
          // følger tastaturets viewport på mobil: interactive-widget=
          // resizes-content). Før: én linje (38/40 px), rul efter ~4 (120 px).
          // Samme felt for medlem og rådgiver; rådgiverens smallere spalte
          // ændrer bredden, ikke højden.
          isCompact ? "py-2.5 min-h-[80px] max-h-[33vh]" : "py-2 min-h-[76px] max-h-[33vh]",
          // lavIHvile (30/9, KUN virksomhedssidens chat på desktop): én linje
          // i hvile (20 + 16 + 4 = 40 px), tre linjer (76 px) så snart feltet
          // har fokus, og derefter vokser det med indholdet op til 33vh som
          // før. tailwind-merge lader min-h-[40px] erstatte min-h-[76px];
          // focus:min-h-[76px] er sin egen variant. Medlemmets chat, /chat og
          // community sender ikke propen — 10/9-beslutningen står der.
          !isCompact && lavIHvile && "min-h-[40px] focus:min-h-[76px] transition-[min-height] duration-150",
        ),
        inputmode: "text",
        enterkeyhint: "send",
      },
      handleKeyDown: (_view, event) => {
        const ed = editorRef.current;
        if (!ed) return false;

        if (event.key === "Backspace" && (ed.isActive("bulletList") || ed.isActive("orderedList"))) {
          const currentText = ed.state.selection.$from.parent.textContent.trim();
          if (!currentText) {
            event.preventDefault();
            ed.chain().focus().liftListItem("listItem").run();
            return true;
          }
        }

        if (event.key === "Enter") {
          if (event.shiftKey && (ed.isActive("bulletList") || ed.isActive("orderedList"))) {
            event.preventDefault();
            ed.chain().focus().splitListItem("listItem").run();
            return true;
          }
          // Enter always creates a line break — send is done via the send button
          return false; // let Tiptap handle it naturally (inserts paragraph)
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          event.preventDefault();
          dropHandledRef.current = true;
          addFiles(Array.from(files));
          setDragOver(false);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          event.preventDefault();
          addFiles(Array.from(files));
          return true;
        }
        return false;
      },
    },
    content: "",
    editable: !disabled,
  });

  useEffect(() => { editorRef.current = editor; }, [editor]);
  useEffect(() => { if (editor) editor.setEditable(!disabled); }, [disabled, editor]);

  // On mobile, when the editor is focused, ensure the composer is visible.
  // With interactive-widget=resizes-content the viewport shrinks automatically,
  // but we still need a small nudge for iOS Safari timing.
  useEffect(() => {
    if (!isMobile || !wrapperRef.current || !editor) return;
    const el = wrapperRef.current;
    const onFocus = () => {
      // Delay to let iOS finish keyboard animation
      setTimeout(() => {
        el.scrollIntoView({ block: "end", behavior: "smooth" });
      }, 300);
    };
    el.addEventListener("focusin", onFocus);
    return () => el.removeEventListener("focusin", onFocus);
  }, [isMobile, editor]);

  const submitFromEditor = useCallback(() => {
    if (!editor) return;
    const text = editor.getText().trim();
    const hasFiles = pendingFiles.length > 0;
    if (!text && !hasFiles) return;
    // isPlain-reglen bor nu i chatAfsendelse (uændret: ren tekst, når HTML'en
    // kun er ét afsnit af samme tekst, ellers HTML) — og dokumentet følger
    // KUN med, når der er en #-henvisning i det.
    const { content, dokument } = chatAfsendelse(text, editor.getHTML(), editor.getJSON());
    onSubmit(content, hasFiles ? pendingFiles : undefined, dokument);
    editor.commands.clearContent(true);
    setPendingFiles([]);
  }, [editor, onSubmit, pendingFiles]);

  useEffect(() => { submitRef.current = submitFromEditor; }, [submitFromEditor]);

  useEffect(() => {
    if (onRequestSubmit) onRequestSubmit(submitFromEditor);
  }, [onRequestSubmit, submitFromEditor]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    addFiles(Array.from(fileList));
    e.target.value = "";
  }, [addFiles]);

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Drag-over / drag-leave on the wrapper
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    // Skip if Tiptap's handleDrop already processed this
    if (dropHandledRef.current) {
      dropHandledRef.current = false;
      return;
    }
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      addFiles(Array.from(files));
    }
  }, [addFiles]);

  const charCount = editor?.storage.characterCount?.characters?.() ?? editor?.getText().length ?? 0;
  const showCounter = !isCompact ? charCount > maxLength * 0.9 : charCount > maxLength * 0.95;
  const hasContent = (editor?.getText().trim().length ?? 0) > 0 || pendingFiles.length > 0;

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "flex-1 border overflow-hidden transition-shadow",
        hb ? "rounded-hb bg-hb-surface" : "rounded-xl bg-secondary",
        dragOver
          ? hb
            ? "border-hb-evergreen ring-2 ring-hb-evergreen/40"
            : "border-primary ring-2 ring-primary/50"
          : hb
            ? "border-hb-line focus-within:ring-2 focus-within:ring-hb-evergreen/40"
            : "border-border focus-within:ring-2 focus-within:ring-primary/50"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {editor && !isCompact && <Toolbar editor={editor} hb={hb} onAttach={() => fileInputRef.current?.click()} videoKnap={videoKnap} />}
      {isCompact ? (
        <div className="flex items-center gap-1 pr-1.5 pl-1">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex-shrink-0 p-2 rounded-lg transition-colors",
              hb
                ? "text-hb-ink-soft hover:text-hb-ink hover:bg-hb-sage/30"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"
            )}
            aria-label="Vedhæft fil"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          {videoKnap && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { if (videoKnap.fremdrift === null) videoKnap.onClick(); }}
              disabled={videoKnap.fremdrift !== null}
              className={cn(
                "flex-shrink-0 p-2 rounded-lg transition-colors",
                hb
                  ? "text-hb-ink-soft hover:text-hb-ink hover:bg-hb-sage/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              )}
              aria-label={videoKnap.fremdrift !== null ? "Videoen sendes" : "Optag video"}
            >
              <VideoKnapIndhold videoKnap={videoKnap} stor />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <EditorContent editor={editor} />
          </div>
          {renderInnerSend && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => submitRef.current()}
              disabled={disabled || !hasContent}
              className={cn(
                "flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-all",
                hasContent && !disabled
                  ? hb
                    ? "bg-hb-evergreen text-white hover:bg-hb-evergreen/90 shadow-sm"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                  : hb
                    ? "bg-hb-sage/40 text-hb-ink-soft"
                    : "bg-muted text-muted-foreground"
              )}
              aria-label="Send besked"
            >
              {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          )}
        </div>
      ) : (
        <EditorContent editor={editor} />
      )}
      <AttachmentPreviewStrip files={pendingFiles} onRemove={removePendingFile} variant={variant} />
      {showCounter && (
        <div className="px-3 pb-1 text-right">
          {/* Tælleren over loftet er rust (advarsel — en af rusts fire betydninger). */}
          <span className={`text-[10px] ${charCount >= maxLength ? (hb ? "text-hb-rust" : "text-destructive") : hb ? "text-hb-ink-soft" : "text-muted-foreground"}`}>
            {charCount}/{maxLength}
          </span>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};

export default ChatRichInput;
