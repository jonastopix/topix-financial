import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { useEffect, useRef, useState, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
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
  Pilcrow,
} from "lucide-react";

// ─── Custom Link mark that preserves CTA attributes ────────────────────────
const CustomLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-cta": {
        default: null,
        parseHTML: (el) => el.getAttribute("data-cta"),
        renderHTML: (attrs) => {
          if (!attrs["data-cta"]) return {};
          return { "data-cta": attrs["data-cta"] };
        },
      },
      "data-cta-color": {
        default: null,
        parseHTML: (el) => el.getAttribute("data-cta-color"),
        renderHTML: (attrs) => {
          if (!attrs["data-cta-color"]) return {};
          return { "data-cta-color": attrs["data-cta-color"] };
        },
      },
    };
  },
});

// ─── Toolbar button ────────────────────────────────────────────────────────
function ToolBtn({
  active,
  disabled,
  onClick,
  children,
  label,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── CTA colors ────────────────────────────────────────────────────────────
const CTA_COLORS = [
  { label: "Grøn", value: "green", hex: "#0fa968" },
  { label: "Blå", value: "blue", hex: "#2563eb" },
  { label: "Sort", value: "black", hex: "#18181b" },
] as const;

// ─── Props ─────────────────────────────────────────────────────────────────
interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

// ─── Main component ────────────────────────────────────────────────────────
export default function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const isInternalUpdate = useRef(false);
  const [ctaColorOpen, setCtaColorOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      CustomLink.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
    ],
    content,
    onUpdate: ({ editor: e }) => {
      isInternalUpdate.current = true;
      onChange(e.getHTML());
    },
  });

  // Sync external content changes (e.g. template switch) — skip internal edits
  useEffect(() => {
    if (!editor) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  // ─── Link handler ──────────────────────────────────────────────────────
  const handleLink = useCallback(() => {
    if (!editor) return;
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
  }, [editor]);

  // ─── CTA button handler ────────────────────────────────────────────────
  const handleInsertCta = useCallback(
    (color: (typeof CTA_COLORS)[number]) => {
      if (!editor) return;
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
    },
    [editor]
  );

  if (!editor) return null;

  const icon = "h-3.5 w-3.5";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="border border-input rounded-md overflow-hidden bg-background">
        {/* ─── Toolbar ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-input bg-muted/30">
          {/* Text style */}
          <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} label="Fed (Ctrl+B)">
            <Bold className={icon} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} label="Kursiv (Ctrl+I)">
            <Italic className={icon} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} label="Gennemstreget">
            <Strikethrough className={icon} />
          </ToolBtn>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Block type */}
          <ToolBtn
            onClick={() => editor.chain().focus().setParagraph().run()}
            active={editor.isActive("paragraph") && !editor.isActive("heading")}
            label="Brødtekst"
          >
            <Pilcrow className={icon} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} label="Overskrift 1">
            <Heading1 className={icon} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} label="Overskrift 2">
            <Heading2 className={icon} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} label="Overskrift 3">
            <Heading3 className={icon} />
          </ToolBtn>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Lists */}
          <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} label="Punktliste">
            <List className={icon} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} label="Nummereret liste">
            <ListOrdered className={icon} />
          </ToolBtn>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Alignment */}
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} label="Venstrestil">
            <AlignLeft className={icon} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} label="Centrér">
            <AlignCenter className={icon} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} label="Højrestil">
            <AlignRight className={icon} />
          </ToolBtn>

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Links */}
          <ToolBtn onClick={handleLink} active={editor.isActive("link")} label="Indsæt / redigér link">
            <LinkIcon className={icon} />
          </ToolBtn>
          {editor.isActive("link") && (
            <ToolBtn onClick={() => editor.chain().focus().unsetLink().run()} label="Fjern link">
              <Unlink className={icon} />
            </ToolBtn>
          )}

          {/* CTA button */}
          <Popover open={ctaColorOpen} onOpenChange={setCtaColorOpen}>
            <PopoverTrigger asChild>
              <span>
                <ToolBtn onClick={() => setCtaColorOpen((o) => !o)} label="Indsæt CTA-knap">
                  <MousePointerClick className={icon} />
                </ToolBtn>
              </span>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start" sideOffset={8}>
              <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Vælg knapfarve</p>
              <div className="flex gap-1.5">
                {CTA_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => handleInsertCta(c)}
                    className="flex flex-col items-center gap-1 rounded-md px-3 py-2 hover:bg-muted transition-colors"
                  >
                    <span
                      className="h-6 w-6 rounded-full border-2 border-muted-foreground/30"
                      style={{ backgroundColor: c.hex }}
                    />
                    <span className="text-[11px] text-foreground">{c.label}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Horizontal rule */}
          <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} label="Vandret linje">
            <Minus className={icon} />
          </ToolBtn>

          <div className="flex-1" />

          {/* Undo / Redo */}
          <ToolBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} label="Fortryd (Ctrl+Z)">
            <Undo className={icon} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} label="Gentag (Ctrl+Shift+Z)">
            <Redo className={icon} />
          </ToolBtn>
        </div>

        {/* ─── Editor area ──────────────────────────────────────────── */}
        <EditorContent
          editor={editor}
          className={[
            "prose prose-sm max-w-none px-4 py-3 min-h-[300px]",
            "focus-within:outline-none",
            "[&_.tiptap]:outline-none [&_.tiptap]:min-h-[280px]",
            // CTA button styling in editor
            "[&_a[data-cta]]:inline-block [&_a[data-cta]]:text-white [&_a[data-cta]]:no-underline",
            "[&_a[data-cta]]:px-6 [&_a[data-cta]]:py-3 [&_a[data-cta]]:rounded-lg",
            "[&_a[data-cta]]:font-semibold [&_a[data-cta]]:text-sm [&_a[data-cta]]:cursor-default",
            "[&_a[data-cta-color=green]]:bg-[#0fa968]",
            "[&_a[data-cta-color=blue]]:bg-[#2563eb]",
            "[&_a[data-cta-color=black]]:bg-[#18181b]",
            // Fallback for CTA without color attribute (legacy)
            "[&_a[data-cta]:not([data-cta-color])]:bg-[#0fa968]",
          ].join(" ")}
        />
      </div>
    </TooltipProvider>
  );
}
