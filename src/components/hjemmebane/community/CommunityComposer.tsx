import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Quote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";

/** Community-composeren — producerer NØJAGTIGT det dokumentformat,
    parseCommunityDokument accepterer. Editoren er konfigureret så den ikke
    kan lave noget, motoren efterfølgende kaster væk — ellers ville
    medlemmet se sit eget indhold forsvinde ved visning.

    onSubmit kaldes med editor.getJSON() — RÅ JSON, ikke HTML og ikke
    tekst: databasen udleder selv tekstuddraget (community_json_til_tekst),
    og klienten bestemmer aldrig hvad der står i indhold-kolonnen. */

export interface CommunityComposerProps {
  onSubmit: (indholdJson: unknown) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  submitLabel?: string;
  visTitel?: boolean; // trådcomposer: true, svarcomposer: false
  titel?: string;
  onTitelChange?: (v: string) => void;
}

/** Kun http/https/mailto får lov at forlade composeren — men motoren
    hærder href'en IGEN ved visning: editoren er bekvemmelighed, ikke
    forsvar. Skemaløse indtastninger får https:// foran (samme greb som
    ChatRichInputs normalizeLinkUrl). */
const normaliserLinkUrl = (raa: string): string => {
  const trimmet = raa.trim();
  if (!trimmet) return "";
  if (/^(https?:\/\/|mailto:)/i.test(trimmet)) return trimmet;
  if (/^[a-z]+:/i.test(trimmet)) return "";
  return `https://${trimmet.replace(/^\/+/, "")}`;
};

function VaerktoejsKnap({
  aktiv,
  onClick,
  title,
  children,
}: {
  aktiv?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-md p-1.5 transition-colors",
        aktiv
          ? "bg-hb-sage text-hb-ink"
          : "text-hb-ink-soft hover:bg-hb-sage/50 hover:text-hb-ink",
      )}
    >
      {children}
    </button>
  );
}

export function CommunityComposer({
  onSubmit,
  disabled = false,
  placeholder = "Hvad arbejder du med lige nu?",
  autoFocus = false,
  submitLabel = "Del",
  visTitel = false,
  titel = "",
  onTitelChange,
}: CommunityComposerProps) {
  const [sender, setSender] = useState(false);
  const sendRef = useRef<() => void>(() => {});

  const editor = useEditor({
    extensions: [
      /* StarterKit beskåret til motorens hvidliste: paragraph, heading
         (kun level 2), bulletList, orderedList, listItem, blockquote,
         hardBreak, text — plus marks bold/italic. codeBlock, strike, code
         og horizontalRule er slået FRA; dropcursor/gapcursor/history er
         redigeringsadfærd og efterlader intet i dokumentet. Billeder
         kommer i et senere led. */
      StarterKit.configure({
        heading: { levels: [2] },
        codeBlock: false,
        code: false,
        strike: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto"],
      }),
      Placeholder.configure({ placeholder }),
    ],
    autofocus: autoFocus ? "end" : false,
    content: "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "tiptap min-h-[120px] px-5 py-4 font-body text-[15px] leading-relaxed text-hb-ink focus:outline-none",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          sendRef.current();
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor) editor.setEditable(!disabled && !sender);
  }, [editor, disabled, sender]);

  const saetLink = useCallback(() => {
    if (!editor) return;
    const eksisterende = editor.getAttributes("link").href as string | undefined;
    const input = window.prompt("Link URL", eksisterende || "https://");
    if (input === null) return;
    if (input.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = normaliserLinkUrl(input);
    if (!href) return;
    const { from, to } = editor.state.selection;
    if (from !== to) {
      editor.chain().focus().setLink({ href }).run();
    } else if (eksisterende) {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    } else {
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: input.trim(), marks: [{ type: "link", attrs: { href } }] })
        .run();
    }
  }, [editor]);

  const harIndhold = (editor?.getText().trim().length ?? 0) > 0;
  const titelOk = !visTitel || titel.trim().length > 0;
  const kanSende = harIndhold && titelOk && !disabled && !sender;

  const send = useCallback(async () => {
    if (!editor) return;
    if (!editor.getText().trim() || (visTitel && !titel.trim())) return;
    if (disabled || sender) return;
    setSender(true);
    try {
      await onSubmit(editor.getJSON());
      /* Feltet ryddes FØRST når onSubmit er resolvet uden fejl — modsat
         ChatRichInput, som rydder optimistisk. Fejler kaldet, må
         medlemmets tekst ikke være væk; den står urørt og kan sendes
         igen. Fejlvisning (toast mv.) ejes af kalderen. */
      editor.commands.clearContent(true);
      onTitelChange?.("");
    } catch {
      /* Bevidst tomt: indholdet bliver stående ved fejl. */
    } finally {
      setSender(false);
    }
  }, [editor, onSubmit, onTitelChange, visTitel, titel, disabled, sender]);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  return (
    <HbCard>
      {visTitel && (
        /* Titlen skal ligne en overskrift man skriver, ikke et input —
           font-editorial, stor, ingen synlig ramme. Enter hopper videre
           til brødteksten. */
        <input
          type="text"
          value={titel}
          onChange={(e) => onTitelChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editor?.commands.focus("end");
            }
          }}
          placeholder="Giv dit opslag en titel"
          disabled={disabled || sender}
          className="w-full border-0 bg-transparent px-5 pt-5 font-editorial text-2xl font-medium leading-tight text-hb-ink placeholder:text-hb-ink-soft/50 focus:outline-none"
        />
      )}

      {/* Editorens indhold spejler visningens typografi (CommunityDokument),
          så det medlemmet ser mens der skrives, er det der publiceres. */}
      <div
        className={cn(
          "[&_.tiptap>*+*]:mt-3",
          "[&_h2]:font-editorial [&_h2]:text-xl [&_h2]:font-medium [&_h2]:leading-tight",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:pl-1",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-hb-line [&_blockquote]:pl-4 [&_blockquote]:text-hb-ink-soft",
          "[&_a]:text-hb-evergreen [&_a]:underline [&_a]:underline-offset-2",
        )}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Diskret værktøjslinje NEDERST — formatering til venstre,
          afsendelse til højre. */}
      <div className="flex items-center gap-0.5 border-t border-hb-line px-3 py-2">
        <VaerktoejsKnap
          aktiv={editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          title="Fed (Cmd+B)"
        >
          <Bold className="h-4 w-4" />
        </VaerktoejsKnap>
        <VaerktoejsKnap
          aktiv={editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          title="Kursiv (Cmd+I)"
        >
          <Italic className="h-4 w-4" />
        </VaerktoejsKnap>
        <VaerktoejsKnap aktiv={editor?.isActive("link")} onClick={saetLink} title="Link">
          <LinkIcon className="h-4 w-4" />
        </VaerktoejsKnap>
        <div className="mx-1 h-4 w-px bg-hb-line" />
        <VaerktoejsKnap
          aktiv={editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          title="Punktopstilling"
        >
          <List className="h-4 w-4" />
        </VaerktoejsKnap>
        <VaerktoejsKnap
          aktiv={editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          title="Nummereret liste"
        >
          <ListOrdered className="h-4 w-4" />
        </VaerktoejsKnap>
        <VaerktoejsKnap
          aktiv={editor?.isActive("blockquote")}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          title="Citat"
        >
          <Quote className="h-4 w-4" />
        </VaerktoejsKnap>
        <VaerktoejsKnap
          aktiv={editor?.isActive("heading", { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Overskrift"
        >
          <Heading2 className="h-4 w-4" />
        </VaerktoejsKnap>

        <div className="ml-auto">
          <HbButton
            type="button"
            variant="primary"
            disabled={!kanSende}
            onClick={() => void send()}
            title="Send (Cmd+Enter)"
          >
            {sender && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </HbButton>
        </div>
      </div>
    </HbCard>
  );
}
