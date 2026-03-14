import React, { useCallback, useEffect } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
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

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = useCallback(() => {
    const prev = editor.getAttributes("link").href;
    const url = window.prompt("Link URL", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
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
    ],
    editorProps: {
      attributes: {
        class:
          "px-3 py-2 text-sm text-foreground focus:outline-none min-h-[38px] max-h-[120px] overflow-y-auto",
        "data-placeholder": placeholder,
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          submitFromEditor();
          return true;
        }
        return false;
      },
    },
    content: "",
    editable: !disabled,
  });

  // Keep editable in sync with disabled prop
  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [disabled, editor]);

  const submitFromEditor = useCallback(() => {
    if (!editor) return;
    const text = editor.getText().trim();
    if (!text) return;
    const html = editor.getHTML();
    // Check if content is just plain text (single paragraph with no marks)
    const isPlain = html === `<p>${text}</p>`;
    onSubmit(isPlain ? text : html);
    editor.commands.clearContent(true);
  }, [editor, onSubmit]);

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
