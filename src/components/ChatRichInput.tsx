import React, { useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, List, ListOrdered, Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatRichInputProps {
  onSubmit: (html: string) => void;
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
  // Block unsupported/custom schemes (e.g. javascript:)
  if (/^[a-z]+:/i.test(trimmed)) return "";
  return `https://${trimmed.replace(/^\/+/, "")}`;
};

function Toolbar({ editor }: { editor: Editor }) {
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        hardBreak: {
          keepMarks: true,
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "px-3 py-2 text-sm text-foreground focus:outline-none min-h-[38px] max-h-[120px] overflow-y-auto",
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
    },
    content: "",
    editable: !disabled,
  });

  // Keep refs in sync
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [disabled, editor]);

  const submitFromEditor = useCallback(() => {
    if (!editor) return;
    const text = editor.getText().trim();
    if (!text) return;
    const html = editor.getHTML();
    const isPlain = html === `<p>${text}</p>`;
    onSubmit(isPlain ? text : html);
    editor.commands.clearContent(true);
  }, [editor, onSubmit]);

  // Keep submitRef in sync
  useEffect(() => {
    submitRef.current = submitFromEditor;
  }, [submitFromEditor]);

  const charCount = editor?.storage.characterCount?.characters?.() ?? editor?.getText().length ?? 0;

  return (
    <div className="flex-1 rounded-xl bg-secondary border border-border overflow-hidden focus-within:ring-2 focus-within:ring-primary/50 transition-shadow">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      {charCount > maxLength * 0.9 && (
        <div className="px-3 pb-1 text-right">
          <span
            className={`text-[10px] ${
              charCount >= maxLength
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {charCount}/{maxLength}
          </span>
        </div>
      )}
    </div>
  );
};

export default ChatRichInput;
