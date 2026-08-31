import React, { useCallback, useEffect, useState } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  Bold, Italic, List, ListOrdered, Link as LinkIcon, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface MessageEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialHTML: string;
  onSave: (html: string) => Promise<boolean> | boolean;
  saving?: boolean;
  /** variant="hb" (C4): Hjemmebane-udtrykket. DialogContent er en
      PORTAL uden for .theme-hjemmebane-wrapperen — klassen sættes
      derfor på Content-elementet selv. Gem er evergreen (handling).
      Uden variant er alt tegn-for-tegn som før. */
  variant?: "hb";
}

// Holdt identisk med ChatRichInput-moenstret. Bevidst kopieret (ikke delt) saa
// compose-editoren ikke roeres - en evt. samling er et andet run.
const normalizeLinkUrl = (rawUrl: string): string => {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (/^[a-z]+:/i.test(trimmed)) return "";
  return `https://${trimmed.replace(/^\/+/, "")}`;
};

function ToolbarBtn({
  active, onClick, children, title, hb,
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

function Toolbar({ editor, hb }: { editor: Editor; hb?: boolean }) {
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
    </div>
  );
}

const MessageEditDialog: React.FC<MessageEditDialogProps> = ({
  open, onOpenChange, initialHTML, onSave, saving = false, variant,
}) => {
  const hb = variant === "hb";
  const [submitting, setSubmitting] = useState(false);

  // Samme restriktive StarterKit som compose. Tilladte formater (fed/kursiv/
  // lister/links/afsnit/linjeskift) matcher praecist render-sanitizens
  // ALLOWED_TAGS: b, strong, i, em, ul, ol, li, a, p, br. Ingen overskrifter,
  // kodeblokke eller citater - de ville alligevel blive saniteret vaek.
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
    ],
    editorProps: {
      attributes: {
        class: cn(
          "px-3 py-2 text-sm focus:outline-none min-h-[160px] max-h-[50vh] overflow-y-auto chat-html-content",
          hb ? "text-hb-ink" : "text-foreground",
        ),
      },
    },
    content: "",
  });

  // Faldgrube 1 (setContent-timing): saet indhold naar dialogen AABNER og editor
  // er klar. Saa gen-aabning for en ANDEN besked viser den rigtige tekst, ikke
  // forrige. Faldgrube 3 (fokus): fokuser efter radix-dialogens mount, ellers
  // staeler dialogen fokus.
  useEffect(() => {
    if (!editor || !open) return;
    editor.commands.setContent(initialHTML || "", false);
    const t = setTimeout(() => editor.commands.focus("end"), 80);
    return () => clearTimeout(t);
  }, [open, editor, initialHTML]);

  const isEmpty = !editor || editor.getText().trim().length === 0;
  const busy = saving || submitting;

  const handleSave = useCallback(async () => {
    if (!editor) return;
    const text = editor.getText().trim();
    if (!text) return; // Faldgrube 4: tom besked gemmer aldrig (og sletter aldrig).
    const html = editor.getHTML();
    // Faldgrube 6 (isPlain-paritet): gem ren tekst hvis der ingen formatering er,
    // ellers HTML. Samme regel som compose, saa data forbliver konsistent.
    const isPlain = html === `<p>${text}</p>`;
    const payload = isPlain ? text : html;
    setSubmitting(true);
    try {
      const ok = await onSave(payload);
      if (ok) onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }, [editor, onSave, onOpenChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl+Enter gemmer. Esc lukker via radix default.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!isEmpty && !busy) handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-lg max-h-[90vh] overflow-y-auto max-sm:h-[100dvh] max-sm:max-w-full max-sm:rounded-none",
          hb && "theme-hjemmebane border-hb-line bg-hb-surface",
        )}
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle className={hb ? "text-hb-ink" : undefined}>Redigér besked</DialogTitle>
        </DialogHeader>

        <div className={cn(
          "border overflow-hidden",
          hb ? "rounded-hb bg-hb-paper border-hb-line" : "rounded-xl bg-secondary border-border",
        )}>
          {editor && <Toolbar editor={editor} hb={hb} />}
          <EditorContent editor={editor} />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className={cn(
              "px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
              hb
                ? "rounded-full text-hb-ink-soft hover:text-hb-ink hover:bg-hb-sage/20"
                : "rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary",
            )}
          >
            Annuller
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isEmpty || busy}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
              hb
                ? "rounded-full bg-hb-evergreen text-white hover:bg-hb-evergreen/90"
                : "rounded-lg bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Gem
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MessageEditDialog;
