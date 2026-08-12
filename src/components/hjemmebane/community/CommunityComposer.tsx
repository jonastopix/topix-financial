import { useCallback, useEffect, useRef, useState } from "react";
// mergeAttributes kommer fra @tiptap/core, men importeres via @tiptap/react,
// som re-eksporterer hele core (dist/index.d.ts: export * from '@tiptap/core')
// — @tiptap/core er en udeklareret transitiv afhængighed, og den deklarerede
// vej er den robuste.
import {
  EditorContent,
  mergeAttributes,
  Node as TiptapNode,
  useEditor,
  type Content,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Paperclip,
  Quote,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadCommunityBillede, uploadCommunityFil } from "@/lib/hjemmebane/communityUpload";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";

/** Billed-noden bærer `path` og `alt` som ENESTE attributter — ingen
    `src`: motoren (parseCommunityDokument) accepterer kun `path`, og en
    `src` ville blive kasseret ved visning.

    PREVIEW i editoren: filen vises lokalt via URL.createObjectURL — et
    preview uden et eneste netværkskald, af præcis den fil medlemmet lige
    har valgt. Der signeres bevidst IKKE i editoren, og grunden er ikke
    kald-økonomi (useQuery cacher på stien — det ville være ét kald pr.
    billede): grunden er, at adgangsdommen (maa_se_community_billede)
    siger nej, indtil opslaget er gemt — stien findes endnu ikke i noget
    dokument.

    Opslaget sker i et modul-niveau Map, fordi Tiptaps renderHTML kører
    uden adgang til React-state. renderHTML rækker (ingen NodeView):
    upload-flowet gemmer object-URL'en FØR noden indsættes, så første
    rendering ser den allerede, og posten ændrer sig aldrig for en given
    sti. Composeren rydder sine egne poster op ved unmount. */
const PREVIEW_URLS = new Map<string, string>();

const CommunityBilledeNode = Image.extend({
  addAttributes() {
    return {
      path: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-path"),
        renderHTML: (attributes: { path?: string | null }) =>
          attributes.path ? { "data-path": attributes.path } : {},
      },
      alt: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("alt") ?? "",
      },
    };
  },
  /* renderHTML og parseHTML skal spejle hinanden, ellers overlever noden
     ikke en serialiserings-runde: uden data-path i den renderede markup
     går stien tabt, og uden parseren kan noden ikke læses tilbage — det
     bider første gang et eksisterende opslag skal redigeres. Begge
     render-former (img og div) bærer data-path, og parseHTML matcher
     begge. */
  parseHTML() {
    /* :not([data-navn]) er nødvendigt: CSS-selektoren div[data-path]
       matcher OGSÅ en div der desuden bærer data-navn — fil-nodens
       markup. Uden udelukkelsen ville de to parseHTML-regler overlappe,
       og en fil kunne parses tilbage som et billede. */
    return [{ tag: "img[data-path]" }, { tag: "div[data-path]:not([data-navn])" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const previewUrl =
      typeof node.attrs.path === "string" ? PREVIEW_URLS.get(node.attrs.path) : undefined;

    if (previewUrl) {
      // Samme klasser som visningen (CommunityBillede), så det medlemmet
      // ser mens der skrives, er det der publiceres.
      return [
        "img",
        mergeAttributes(HTMLAttributes, {
          src: previewUrl,
          class: "h-auto max-w-full rounded-hb border border-hb-line",
        }),
      ];
    }

    /* Ingen preview-URL: fx et eksisterende opslag åbnet til redigering,
       hvor filen aldrig har været i denne fane — dér findes filen ikke
       lokalt, og signering i editoren er ikke vejen (adgangsdommen og
       flowet ovenfor). Det rette billede vises igen, så snart opslaget
       er gemt. */
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class:
          "select-none rounded-hb border border-hb-line bg-hb-sage/30 px-4 py-6 text-center text-sm text-hb-ink-soft",
      }),
      "Billede",
    ];
  },
});

/** Community-composeren — producerer NØJAGTIGT det dokumentformat,
    parseCommunityDokument accepterer. Editoren er konfigureret så den ikke
    kan lave noget, motoren efterfølgende kaster væk — ellers ville
    medlemmet se sit eget indhold forsvinde ved visning.

    onSubmit kaldes med editor.getJSON() — RÅ JSON, ikke HTML og ikke
    tekst: databasen udleder selv tekstuddraget (community_json_til_tekst),
    og klienten bestemmer aldrig hvad der står i indhold-kolonnen. */

export interface CommunityComposerProps {
  onSubmit: (indholdJson: unknown) => void | Promise<void>;
  /** Bruges som mappe-præfiks ved billed-upload (bucketens INSERT-policy
      kræver eget uuid-præfiks). Kalderen leverer den. */
  brugerId: string;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  submitLabel?: string;
  visTitel?: boolean; // trådcomposer: true, svarcomposer: false
  titel?: string;
  onTitelChange?: (v: string) => void;
  /** Redigeringstilstand: et Tiptap-dokument, editoren starter med. */
  startIndhold?: unknown;
  /** Vises som sekundær knap ved siden af send-knappen, når den er sat. */
  onAnnuller?: () => void;
}

/** Vedhæftet fil — egen atom-blok-node bygget med Node.create, IKKE en
    Image-udvidelse: en fil er ikke et billede, og navnet (ikke alt) er
    dens bærende attribut. Nodetypen hedder "fil" (dansk, vores egen —
    motoren matcher på det navn).

    renderHTML og parseHTML spejler hinanden: div med data-path OG
    data-navn, parseren matcher div[data-path][data-navn]. Billed-noden
    matcher div[data-path]:not([data-navn]), så de to kan ikke forveksles
    — en serialiserings-runde lander altid på den rigtige nodetype.

    Editoren renderer noden som samme dokumentrække som visningen
    (CommunityFil), men UDEN downloadknap — filen er ikke gemt endnu, og
    adgangsdommen ville sige nej til signering. */
const CommunityFilNode = TiptapNode.create({
  name: "fil",
  group: "block",
  atom: true,
  draggable: false,
  addAttributes() {
    return {
      path: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-path"),
        renderHTML: (attributes: { path?: string | null }) =>
          attributes.path ? { "data-path": attributes.path } : {},
      },
      navn: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-navn") ?? "",
        renderHTML: (attributes: { navn?: string }) =>
          attributes.navn ? { "data-navn": attributes.navn } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-path][data-navn]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class:
          "select-none rounded-hb border border-hb-line px-4 py-3 font-body text-sm text-hb-ink",
      }),
      String(node.attrs.navn ?? ""),
    ];
  },
});

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
  disabled,
  onClick,
  title,
  children,
}: {
  aktiv?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-md p-1.5 transition-colors disabled:opacity-50",
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
  brugerId,
  disabled = false,
  placeholder = "Hvad arbejder du med lige nu?",
  autoFocus = false,
  submitLabel = "Del",
  visTitel = false,
  titel = "",
  onTitelChange,
  startIndhold,
  onAnnuller,
}: CommunityComposerProps) {
  const [sender, setSender] = useState(false);
  const [uploaderBillede, setUploaderBillede] = useState(false);
  const [uploaderFil, setUploaderFil] = useState(false);
  const sendRef = useRef<() => void>(() => {});
  const billedInputRef = useRef<HTMLInputElement>(null);
  const filInputRef = useRef<HTMLInputElement>(null);
  /** Denne composers egne previews (sti → object-URL) — delmængden af
      PREVIEW_URLS, som netop denne instans har skabt og skal rydde op. */
  const egnePreviews = useRef(new Map<string, string>());

  /* Oprydning ved unmount: uden revokeObjectURL holder browseren fast i
     hvert uploadet billede i hukommelsen, indtil fanen lukkes — en
     composer der har set ti billeder, ville lække ti blobs. Posterne
     fjernes også fra modul-Map'et, så det ikke vokser på tværs af
     composer-liv. */
  useEffect(() => {
    const previews = egnePreviews.current;
    return () => {
      for (const [sti, url] of previews) {
        URL.revokeObjectURL(url);
        PREVIEW_URLS.delete(sti);
      }
      previews.clear();
    };
  }, []);

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
      CommunityBilledeNode,
      CommunityFilNode,
      Placeholder.configure({ placeholder }),
    ],
    autofocus: autoFocus ? "end" : false,
    content: (startIndhold ?? "") as Content,
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

  const vaelgBillede = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fil = e.target.files?.[0];
      // Nulstil straks, så den samme fil kan vælges igen.
      e.target.value = "";
      if (!fil || !editor) return;
      setUploaderBillede(true);
      try {
        const sti = await uploadCommunityBillede(fil, brugerId);
        // Object-URL'en registreres FØR noden indsættes, så renderHTML
        // ser den allerede ved første rendering.
        const previewUrl = URL.createObjectURL(fil);
        PREVIEW_URLS.set(sti, previewUrl);
        egnePreviews.current.set(sti, previewUrl);
        editor
          .chain()
          .focus()
          .insertContent({ type: "image", attrs: { path: sti, alt: "" } })
          .run();
      } catch (fejl) {
        toast.error(fejl instanceof Error ? fejl.message : "Billedet kunne ikke uploades");
      } finally {
        setUploaderBillede(false);
      }
    },
    [editor, brugerId],
  );

  const vaelgFil = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fil = e.target.files?.[0];
      // Nulstil straks, så den samme fil kan vælges igen.
      e.target.value = "";
      if (!fil || !editor) return;
      setUploaderFil(true);
      try {
        const { sti, navn } = await uploadCommunityFil(fil, brugerId);
        editor
          .chain()
          .focus()
          .insertContent({ type: "fil", attrs: { path: sti, navn } })
          .run();
      } catch (fejl) {
        toast.error(fejl instanceof Error ? fejl.message : "Filen kunne ikke uploades");
      } finally {
        setUploaderFil(false);
      }
    },
    [editor, brugerId],
  );

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
         igen. Fejlvisning (toast mv.) ejes af kalderen.

         I REDIGERINGSTILSTAND (startIndhold sat) ryddes der slet ikke:
         formularen lukkes af kalderen, og en rydning ville blinke et
         tomt felt op, lige før den forsvinder. */
      if (startIndhold === undefined) {
        editor.commands.clearContent(true);
        onTitelChange?.("");
      }
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
        <VaerktoejsKnap
          disabled={uploaderBillede || disabled || sender}
          onClick={() => billedInputRef.current?.click()}
          title="Indsæt billede"
        >
          {uploaderBillede ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
        </VaerktoejsKnap>
        <input
          ref={billedInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={vaelgBillede}
        />
        <VaerktoejsKnap
          disabled={uploaderFil || disabled || sender}
          onClick={() => filInputRef.current?.click()}
          title="Vedhæft fil"
        >
          {uploaderFil ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
        </VaerktoejsKnap>
        <input
          ref={filInputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.docx,.doc,.xml"
          className="hidden"
          onChange={vaelgFil}
        />

        <div className="ml-auto flex items-center gap-2">
          {onAnnuller && (
            <HbButton type="button" variant="secondary" disabled={sender} onClick={onAnnuller}>
              Annuller
            </HbButton>
          )}
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
