import * as React from "react";
import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  Link as LinkIcon,
  List,
  ListOrdered,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HbEditorRichtextProps {
  /** Kun initialindhold — remount med key={entityId} ved selektionsskift. */
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const ToolButton = ({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onMouseDown={(e) => {
      e.preventDefault();
      onClick();
    }}
    className={cn(
      "rounded-md p-1.5 transition-colors",
      active ? "bg-hb-sage text-hb-ink" : "text-hb-ink-soft hover:bg-hb-sage/40 hover:text-hb-ink",
    )}
  >
    {children}
  </button>
);

/** Slank Tiptap i hb-udtryk til lektions-/opslagstekst. Bevidst ikke husets
    RichTextEditor (email-CTA-værktøjer + shadcn-popovers, der portalerer ud
    af theme-scopet) — samme extensions-familie, egen rolig toolbar. */
export const HbEditorRichtext = ({ content, onChange, placeholder }: HbEditorRichtextProps) => {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder ?? "Skriv indholdet…" }),
    ],
    content,
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
  });

  if (!editor) return null;

  const applyLink = () => {
    const url = linkUrl.trim();
    if (url && url !== "https://") {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setLinkOpen(false);
    setLinkUrl("https://");
  };

  return (
    <div className="overflow-hidden rounded-lg border border-hb-line bg-hb-surface focus-within:ring-2 focus-within:ring-hb-evergreen/60">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-hb-line px-2 py-1.5">
        <ToolButton
          label="Fed"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          label="Kursiv"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolButton>
        <span className="mx-1 h-4 w-px bg-hb-line" />
        <ToolButton
          label="Overskrift"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          label="Underoverskrift"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-4 w-4" />
        </ToolButton>
        <span className="mx-1 h-4 w-px bg-hb-line" />
        <ToolButton
          label="Punktliste"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          label="Nummereret liste"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolButton>
        <span className="mx-1 h-4 w-px bg-hb-line" />
        <ToolButton
          label="Link"
          active={editor.isActive("link")}
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
            } else {
              setLinkUrl((editor.getAttributes("link").href as string) ?? "https://");
              setLinkOpen((open) => !open);
            }
          }}
        >
          <LinkIcon className="h-4 w-4" />
        </ToolButton>
        {linkOpen && (
          <span className="ml-1 flex min-w-0 flex-1 items-center gap-1">
            <input
              autoFocus
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === "Escape") setLinkOpen(false);
              }}
              placeholder="https://…"
              className="min-w-0 flex-1 rounded-md border border-hb-line bg-hb-surface px-2 py-1 text-xs text-hb-ink focus:outline-none focus:ring-1 focus:ring-hb-evergreen/60"
            />
            <button
              type="button"
              onClick={applyLink}
              className="rounded-md px-2 py-1 text-xs font-medium text-hb-evergreen hover:bg-hb-sage/40"
            >
              Sæt
            </button>
          </span>
        )}
      </div>
      <EditorContent
        editor={editor}
        className="[&_.ProseMirror]:min-h-[10rem] [&_.ProseMirror]:px-3.5 [&_.ProseMirror]:py-3 [&_.ProseMirror]:text-[15px] [&_.ProseMirror]:leading-relaxed [&_.ProseMirror]:text-hb-ink [&_.ProseMirror]:focus:outline-none [&_.ProseMirror_a]:text-hb-rust [&_.ProseMirror_a]:underline [&_.ProseMirror_h2]:font-editorial [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-medium [&_.ProseMirror_h3]:font-editorial [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-medium [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_p.is-editor-empty:first-child]:before:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child]:before:float-left [&_.ProseMirror_p.is-editor-empty:first-child]:before:h-0 [&_.ProseMirror_p.is-editor-empty:first-child]:before:text-hb-ink-soft/50 [&_.ProseMirror_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5"
      />
    </div>
  );
};
