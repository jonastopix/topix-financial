import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { useEffect, useRef, useState, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        parseHTML: (el: HTMLElement) => el.getAttribute("data-cta"),
        renderHTML: (attrs: Record<string, unknown>) => {
          if (!attrs["data-cta"]) return {};
          return { "data-cta": attrs["data-cta"] };
        },
      },
      "data-cta-color": {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-cta-color"),
        renderHTML: (attrs: Record<string, unknown>) => {
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
          onClick={(e) => {
            e.preventDefault();
            onClick();
          }}
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
  const [ctaOpen, setCtaOpen] = useState(false);
  const [ctaUrl, setCtaUrl] = useState("https://");
  const [ctaLabel, setCtaLabel] = useState("Klik her");
  const [ctaColor, setCtaColor] = useState<(typeof CTA_COLORS)[number]>(CTA_COLORS[0]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

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
  const handleLinkOpen = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href || "";
    setLinkUrl(previousUrl || "https://");
    setLinkOpen(true);
  }, [editor]);

  const handleLinkSubmit = useCallback(() => {
    if (!editor) return;
    setLinkOpen(false);
    if (!linkUrl || linkUrl === "https://") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: linkUrl })
      .run();
  }, [editor, linkUrl]);

  // ─── CTA button handler ────────────────────────────────────────────────
  const handleInsertCta = useCallback(() => {
    if (!editor || !ctaUrl || ctaUrl === "https://") return;
    setCtaOpen(false);

    // Insert a paragraph with the CTA link
    editor
      .chain()
      .focus()
      .insertContent({
        type: "paragraph",
        attrs: { textAlign: "center" },
        content: [
          {
            type: "text",
            marks: [
              {
                type: "link",
                attrs: {
                  href: ctaUrl,
                  target: "_blank",
                  rel: "noopener noreferrer nofollow",
                  class: "text-primary underline",
                  "data-cta": "true",
                  "data-cta-color": ctaColor.value,
                },
              },
            ],
            text: ctaLabel || "Klik her",
          },
        ],
      })
      .run();

    // Reset form
    setCtaUrl("https://");
    setCtaLabel("Klik her");
    setCtaColor(CTA_COLORS[0]);
  }, [editor, ctaUrl, ctaLabel, ctaColor]);

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

          {/* Link */}
          <Popover open={linkOpen} onOpenChange={setLinkOpen}>
            <PopoverTrigger asChild>
              <span>
                <ToolBtn onClick={handleLinkOpen} active={editor.isActive("link")} label="Indsæt / redigér link">
                  <LinkIcon className={icon} />
                </ToolBtn>
              </span>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="start" sideOffset={8}>
              <div className="space-y-2">
                <Label className="text-xs">URL</Label>
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="h-8 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleLinkSubmit()}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleLinkSubmit}>
                    Anvend
                  </Button>
                  {editor.isActive("link") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setLinkOpen(false);
                        editor.chain().focus().extendMarkRange("link").unsetLink().run();
                      }}
                    >
                      Fjern link
                    </Button>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* CTA button */}
          <Popover open={ctaOpen} onOpenChange={setCtaOpen}>
            <PopoverTrigger asChild>
              <span>
                <ToolBtn onClick={() => setCtaOpen((o) => !o)} label="Indsæt CTA-knap">
                  <MousePointerClick className={icon} />
                </ToolBtn>
              </span>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="start" sideOffset={8}>
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Indsæt CTA-knap</p>

                {/* Color picker */}
                <div className="flex gap-1.5">
                  {CTA_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCtaColor(c)}
                      className={`flex flex-col items-center gap-1 rounded-md px-3 py-1.5 transition-colors ${
                        ctaColor.value === c.value ? "bg-muted ring-1 ring-primary" : "hover:bg-muted"
                      }`}
                    >
                      <span
                        className="h-5 w-5 rounded-full border-2"
                        style={{
                          backgroundColor: c.hex,
                          borderColor: c.value === "black" ? "hsl(var(--muted-foreground) / 0.5)" : c.hex,
                        }}
                      />
                      <span className="text-[10px] text-foreground">{c.label}</span>
                    </button>
                  ))}
                </div>

                {/* URL */}
                <div>
                  <Label className="text-xs">URL</Label>
                  <Input
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="h-8 text-sm"
                  />
                </div>

                {/* Label */}
                <div>
                  <Label className="text-xs">Knaptekst</Label>
                  <Input
                    value={ctaLabel}
                    onChange={(e) => setCtaLabel(e.target.value)}
                    placeholder="Klik her"
                    className="h-8 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleInsertCta()}
                  />
                </div>

                {/* Preview */}
                <div className="flex justify-center py-1">
                  <span
                    className="inline-block text-white text-xs font-semibold px-5 py-2 rounded-lg"
                    style={{ backgroundColor: ctaColor.hex }}
                  >
                    {ctaLabel || "Klik her"}
                  </span>
                </div>

                <Button size="sm" className="w-full h-8" onClick={handleInsertCta}>
                  Indsæt knap
                </Button>
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
            "px-4 py-3 min-h-[300px]",
            "focus-within:outline-none",
            "[&_.tiptap]:outline-none [&_.tiptap]:min-h-[280px]",
            // Base text
            "[&_.tiptap_p]:text-sm [&_.tiptap_p]:leading-relaxed [&_.tiptap_p]:my-1.5",
            // Headings – visually distinct
            "[&_.tiptap_h1]:text-2xl [&_.tiptap_h1]:font-bold [&_.tiptap_h1]:mt-4 [&_.tiptap_h1]:mb-2 [&_.tiptap_h1]:text-foreground",
            "[&_.tiptap_h2]:text-xl [&_.tiptap_h2]:font-bold [&_.tiptap_h2]:mt-3 [&_.tiptap_h2]:mb-2 [&_.tiptap_h2]:text-foreground",
            "[&_.tiptap_h3]:text-lg [&_.tiptap_h3]:font-semibold [&_.tiptap_h3]:mt-2 [&_.tiptap_h3]:mb-1.5 [&_.tiptap_h3]:text-foreground",
            // Lists
            "[&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6 [&_.tiptap_ul]:my-2",
            "[&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6 [&_.tiptap_ol]:my-2",
            "[&_.tiptap_li]:text-sm [&_.tiptap_li]:my-0.5",
            // Blockquote
            "[&_.tiptap_blockquote]:border-l-3 [&_.tiptap_blockquote]:border-primary [&_.tiptap_blockquote]:pl-4 [&_.tiptap_blockquote]:italic [&_.tiptap_blockquote]:text-muted-foreground",
            // HR
            "[&_.tiptap_hr]:border-border [&_.tiptap_hr]:my-4",
            // Links
            "[&_.tiptap_a]:text-primary [&_.tiptap_a]:underline",
            // CTA button styling in editor
            "[&_.tiptap_a[data-cta]]:inline-block [&_.tiptap_a[data-cta]]:text-white [&_.tiptap_a[data-cta]]:no-underline",
            "[&_.tiptap_a[data-cta]]:px-6 [&_.tiptap_a[data-cta]]:py-3 [&_.tiptap_a[data-cta]]:rounded-lg",
            "[&_.tiptap_a[data-cta]]:font-semibold [&_.tiptap_a[data-cta]]:text-sm [&_.tiptap_a[data-cta]]:cursor-default",
            "[&_.tiptap_a[data-cta-color=green]]:bg-[#0fa968]",
            "[&_.tiptap_a[data-cta-color=blue]]:bg-[#2563eb]",
            "[&_.tiptap_a[data-cta-color=black]]:bg-[#18181b]",
            "[&_.tiptap_a[data-cta]:not([data-cta-color])]:bg-[#0fa968]",
          ].join(" ")}
        />
      </div>
    </TooltipProvider>
  );
}
