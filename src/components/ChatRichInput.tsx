import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, List, ListOrdered, Link as LinkIcon, Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachmentPreviewStrip } from "@/components/ChatAttachments";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,image/gif,.pdf,.xlsx,.xls,.csv,.doc,.docx";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

interface ChatRichInputProps {
  onSubmit: (html: string, files?: File[]) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}

function ToolbarBtn({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
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
          ? "bg-primary/15 text-primary"
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

function Toolbar({ editor, onAttach }: { editor: Editor; onAttach: () => void }) {
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
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border">
      <ToolbarBtn
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Fed (Ctrl+B)"
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Kursiv (Ctrl+I)"
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <div className="w-px h-4 bg-border mx-0.5" />
      <ToolbarBtn
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Punktliste"
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Nummereret liste"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <div className="w-px h-4 bg-border mx-0.5" />
      <ToolbarBtn
        active={editor.isActive("link")}
        onClick={setLink}
        title="Link"
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <div className="w-px h-4 bg-border mx-0.5" />
      <ToolbarBtn
        active={false}
        onClick={onAttach}
        title="Vedhæft fil"
      >
        <Paperclip className="h-3.5 w-3.5" />
      </ToolbarBtn>
    </div>
  );
}

const ChatRichInput: React.FC<ChatRichInputProps> = ({
  onSubmit,
  disabled = false,
  placeholder = "Skriv en besked...",
  maxLength = 5000,
}) => {
  const editorRef = useRef<Editor | null>(null);
  const submitRef = useRef<() => void>(() => {});
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    ],
    editorProps: {
      attributes: {
        class: "px-3 py-2 text-sm text-foreground focus:outline-none min-h-[38px] max-h-[120px] overflow-y-auto",
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
          if (!event.shiftKey) {
            event.preventDefault();
            submitRef.current();
            return true;
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          event.preventDefault();
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

  const submitFromEditor = useCallback(() => {
    if (!editor) return;
    const text = editor.getText().trim();
    const hasFiles = pendingFiles.length > 0;
    if (!text && !hasFiles) return;
    const html = editor.getHTML();
    const isPlain = html === `<p>${text}</p>`;
    onSubmit(isPlain ? text : html, hasFiles ? pendingFiles : undefined);
    editor.commands.clearContent(true);
    setPendingFiles([]);
  }, [editor, onSubmit, pendingFiles]);

  useEffect(() => { submitRef.current = submitFromEditor; }, [submitFromEditor]);

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
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      addFiles(Array.from(files));
    }
  }, [addFiles]);

  const charCount = editor?.storage.characterCount?.characters?.() ?? editor?.getText().length ?? 0;

  return (
    <div
      className={cn(
        "flex-1 rounded-xl bg-secondary border overflow-hidden transition-shadow",
        dragOver
          ? "border-primary ring-2 ring-primary/50"
          : "border-border focus-within:ring-2 focus-within:ring-primary/50"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {editor && <Toolbar editor={editor} onAttach={() => fileInputRef.current?.click()} />}
      <EditorContent editor={editor} />
      <AttachmentPreviewStrip files={pendingFiles} onRemove={removePendingFile} />
      {charCount > maxLength * 0.9 && (
        <div className="px-3 pb-1 text-right">
          <span className={`text-[10px] ${charCount >= maxLength ? "text-destructive" : "text-muted-foreground"}`}>
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
