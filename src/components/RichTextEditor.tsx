import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { useEffect, useRef, useCallback, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Unlink,
  Heading1,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Minus,
  MousePointerClick,
} from "lucide-react";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

export default function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  // Track whether the latest content change came from the editor itself
  const isInternalUpdate = useRef(false);
  const [ctaColorOpen, setCtaColorOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
    ],
    content,
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      onChange(editor.getHTML());
    },
  });

  // Only sync external content changes (e.g. switching templates)
  // Skip when the change originated from the editor itself
  useEffect(() => {
    if (!editor) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    // Only set content if it actually differs from what the editor has
    const currentHtml = editor.getHTML();
    if (content !== currentHtml) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  if (!editor) return null;

  const ToolBtn = ({
    active,
    disabled,
    onClick,
    children,
    title,
  }: {
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    title?: string;
  }) => (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon"
      className="h-7 w-7"
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </Button>
  );

  const addLink = () => {
    const previousUrl = editor.getAttributes("link").href || "";
    const { from, to } = editor.state.selection;
    const url = window.prompt("URL:", previousUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .setTextSelection({ from, to })
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  };

  const ctaColors = [
    { label: "Grøn", value: "green", hex: "#0fa968" },
    { label: "Blå", value: "blue", hex: "#2563eb" },
    { label: "Sort", value: "black", hex: "#18181b" },
  ];

  const insertCtaButton = (color: { value: string; hex: string }) => {
    setCtaColorOpen(false);
    const url = window.prompt("CTA knap URL:", "https://");
    if (!url) return;
    const label = window.prompt("Knap tekst:", "Klik her");
    if (!label) return;

    editor
      .chain()
      .focus()
      .insertContent(
        `<p style="text-align:center"><a href="${url}" data-cta="true" data-cta-color="${color.value}">${label}</a></p>`
      )
      .run();
  };

  return (
    <div className="border border-input rounded-md overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-input bg-muted/30">
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Fed">
          <Bold className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Kursiv">
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Gennemstreget">
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Overskrift 1">
          <Heading1 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Overskrift 2">
          <Heading2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Overskrift 3">
          <Heading3 className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Punktliste">
          <List className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Nummereret liste">
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Venstrestil">
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Centrér">
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Højrestil">
          <AlignRight className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolBtn onClick={addLink} active={editor.isActive("link")} title="Tilføj link">
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolBtn>
        {editor.isActive("link") && (
          <ToolBtn onClick={() => editor.chain().focus().unsetLink().run()} title="Fjern link">
            <Unlink className="h-3.5 w-3.5" />
          </ToolBtn>
        )}

        <Popover open={ctaColorOpen} onOpenChange={setCtaColorOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Indsæt CTA-knap">
              <MousePointerClick className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">Vælg knapfarve</p>
            <div className="flex gap-1.5">
              {ctaColors.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => insertCtaButton(c)}
                  className="flex flex-col items-center gap-1 rounded-md px-3 py-2 hover:bg-muted transition-colors"
                >
                  <span className="h-5 w-5 rounded-full border" style={{ backgroundColor: c.hex }} />
                  <span className="text-[11px]">{c.label}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Vandret linje">
          <Minus className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="flex-1" />

        <ToolBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Fortryd">
          <Undo className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Gentag">
          <Redo className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none px-4 py-3 min-h-[300px] focus-within:outline-none [&_.tiptap]:outline-none [&_.tiptap]:min-h-[280px] [&_a[data-cta]]:inline-block [&_a[data-cta]]:text-white [&_a[data-cta]]:no-underline [&_a[data-cta]]:px-6 [&_a[data-cta]]:py-3 [&_a[data-cta]]:rounded-lg [&_a[data-cta]]:font-semibold [&_a[data-cta]]:text-sm [&_a[data-cta-color=green]]:bg-[#0fa968] [&_a[data-cta-color=blue]]:bg-[#2563eb] [&_a[data-cta-color=black]]:bg-[#18181b]"
      />
    </div>
  );
}
