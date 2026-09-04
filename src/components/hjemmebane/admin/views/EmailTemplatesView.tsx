import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import RichTextEditor from "@/components/RichTextEditor";
import { HbButton } from "../../HbButton";
import { HbCard } from "../../HbCard";
import { HbTag } from "../../HbTag";
import { HbAdminSplit } from "../HbAdminShell";
import { HbField, HbInput, HbSelect, HbTextarea } from "../HbField";
import { HbSegmented } from "../HbSegmented";
import { HbTreeList, type HbListRow } from "../HbTreeList";
import { useAdminHotkeys } from "../useAdminHotkeys";
import { EditorBar, EditorShell, type EditorAction, type EditorHandle } from "../editors/shared";

/**
 * E-mail-skabeloner i Hjemmebane (4/9) — konvertering af
 * src/pages/EmailTemplates.tsx (målt 4/9: 1140 linjer i tre komponenter
 * plus seks hjælpefunktioner, fire Radix Select, RichTextEditor på 530
 * linjer med to Popover og én Tooltip, én tabel på fem kolonner, 25
 * formularfelter — DYREST af de otte). Queries, sådningen af tabellen,
 * mutationerne, e-mail-shell-funktionerne, cron-vælgerne, testsenderen
 * og teksterne står som i den gamle fil — kun udtrykket er nyt. Med
 * denne er den sidste gamle admin-side væk.
 *
 * FLADEN SKAL GENTÆNKES — DET ER IKKE DENNE PR. Jonas 4/9: siden skal
 * på sigt blive det FULDE overblik over alle mails — transaktionelle,
 * påmindelser og marketing — med hvornår de kører, hvad der udløser dem,
 * og mulighed for at rette dem. I dag viser den kun `email_templates`
 * (skabeloner der OVERSTYRER de indbyggede standardmails, jf. info-
 * teksten) og de seneste 50 rækker af `email_send_log`; de indbyggede
 * mails, cron-jobbene i `cron.job` og notifikationskæden er usynlige
 * her. Det er en flade der skal designes som indgangen og forsiden:
 * HVAD først, form bagefter (docs/OVERLEVERING.md DEL 3, «DESIGNPUNKT»).
 * Denne fil konverterer UDTRYKKET af det der findes.
 *
 * SKALLEN er HbMemberShell (layout="fuld", som Legat og Feedback) —
 * siden er et «Platform»-punkt i admin-blokken. Menuen røres ikke.
 *
 * FORMEN er HbAdminSplit + HbTreeList: `TemplateList` (gamle :206-335)
 * er blevet listen til venstre, `TemplateEditor` (:770-1140) editoren
 * til højre — 1:1. Listens øje-knap (inline preview pr. række) er
 * droppet: Preview-fanen i editoren viser det samme og mere. Status-
 * prikken er HbTreeLists: aktiv skabelon = «published», inaktiv =
 * «draft» — det er det Switch'en var, og EditorBar bærer skiftet
 * (Aktivér/Deaktivér som synlig handling, ikke en toggle). Den gamle
 * «Rediger»-knap er selektion; «Duplikér» og «Send testmail til mig»
 * er link-handlinger i bundlinjen; «Slet» er DeleteSpec (inline
 * bekræftelse i bundlinjen) i stedet for browserens `confirm()`.
 *
 * TOM HØJRESIDE = OVERSIGTEN: det den gamle side viste OVER listen
 * (info-teksten om overstyring, «Månedlig digest» med «Send digest nu»,
 * sendt-loggen og platform-links til brug i skabeloner) bor i højre felt
 * når ingen skabelon er valgt. Splittet har ingen plads til det over
 * en 380 px-liste, og det er sidens indhold, ikke pynt.
 *
 * DE FEM FANER — NY FORM I HUSET, markeret så den kan løftes: `HbFaner`
 * nedenfor er HbSegmented som fane-linje (role=radiogroup, pile-
 * navigation) over ét panel med role=tabpanel. Valgt frem for fem
 * stablede sektioner, fordi editorens indhold (Tiptap, rå HTML-textarea
 * på 400 px, iframe på 400 px) ville give en side på flere skærmhøjder,
 * hvor man aldrig ser det man arbejder med. Segmentet er «ét stort
 * roligt element» (HbSegmented.tsx:12-14) — fem valg er dets øvre
 * grænse, og de fem er sidens egne. Samme fem, samme rækkefølge, samme
 * tekster; «Visuel redigering» er åben fra start som før.
 *
 * RICH TEXT: DEN GAMLE `RichTextEditor` ER MONTERET UÆNDRET OG MARKERET
 * — som Milestones' portaler i etape 1. Afgjort ved læsning 4/9:
 * HbEditorRichtext bruger Tiptaps almindelige Link-extension, og
 * Tiptap SMIDER attributter der ikke står i skemaet — så en skabelon
 * med en CTA-knap (`<a data-cta="true" data-cta-color="…">`, som
 * `inlineEmailStyles` :141-148 bygger knappen af) ville blive et
 * almindeligt link ved næste gem, og `text-align` på afsnit (som
 * `extractBodyContent` :188-192 bevarer med vilje) ville forsvinde.
 * Det er ikke «tab af TextAlign/Color-knapper» — det er tab af DATA i
 * eksisterende mails. Den gamle editor bærer sin egen CustomLink
 * (RichTextEditor.tsx:35-57), CTA-popoveren og justering; den ser mørk
 * ud (to Popover, én Tooltip, shadcn-tokens) og det er accepteret i
 * denne etape. Etape 2 er en Hb-editor med CustomLink + TextAlign +
 * CTA-værktøj uden portaler — eller, mere sandsynligt, den gentænkte
 * flade (ovenfor).
 *
 * HTML- OG PREVIEW-FANEN har intet forbillede: bygget enklest muligt —
 * rå HTML i HbTextarea (mono, 400 px), preview i samme sandboxede
 * iframe som før, i en HbCard-ramme. Teknisk indhold i en rolig ramme.
 *
 * DE FIRE SELECT er HbSelect (native): trigger-type (3), dag i måneden
 * (28), tidspunkt (24), hændelse (5). Sendt-loggen er grid-listen
 * (EmailLogView-formen) med de samme fem kolonner.
 */

interface SendLogEntry {
  id: string;
  template_id: string;
  recipient_email: string;
  subject: string;
  status: string;
  error_message: string | null;
  sent_at: string;
  is_test: boolean;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  sender_name: string;
  sender_email: string;
  trigger_type: string;
  trigger_config: Record<string, any>;
  enabled: boolean;
  variables: Array<{ key: string; example: string; description: string }>;
  created_at: string;
  updated_at: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  cron: "Tidsplan",
  event: "Hændelse",
  manual: "Manuel",
};

const CRON_DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);
const CRON_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

const EVENT_OPTIONS = [
  { value: "report_missing", label: "Rapport mangler" },
  { value: "invitation_sent", label: "Invitation sendt" },
  { value: "new_user", label: "Ny bruger oprettet" },
  { value: "milestone_deadline", label: "Milestone deadline nærmer sig" },
  { value: "membership_days", label: "X dage efter medlemsskabs-start" },
];

const PLATFORM_URLS: { label: string; url: string; variable: string; description: string }[] = [
  { label: "Signup / Accept invitation", url: "https://app.theboardroom.dk/auth", variable: "signup_url", description: "Link til login/signup – bruges i invitationer" },
  { label: "Rapportering", url: "https://app.theboardroom.dk/reports", variable: "report_url", description: "Link til rapport-upload – bruges i påmindelser" },
  { label: "Dashboard", url: "https://app.theboardroom.dk/", variable: "dashboard_url", description: "Link til forsiden / dashboard" },
  { label: "Milepæle", url: "https://app.theboardroom.dk/milestones", variable: "milestones_url", description: "Link til milepæle-oversigt" },
  { label: "Budget", url: "https://app.theboardroom.dk/budget", variable: "budget_url", description: "Link til budget-oversigt" },
];

function replaceVariables(html: string, variables: EmailTemplate["variables"]) {
  let result = html;
  for (const v of variables) {
    result = result.split(`{{${v.key}}}`).join(v.example);
  }
  return result;
}

function cronToDescription(config: Record<string, any>): string {
  const schedule = config?.schedule || "";
  const match = schedule.match(/^(\d+)\s+(\d+)\s+(\d+|\*)\s+\*\s+\*$/);
  if (!match) return schedule;
  const [, min, hour, day] = match;
  if (day === "*") return `Hver dag kl. ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  return `Den ${day}. i hver måned kl. ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
}

/** Inject inline styles into semantic HTML tags for email client compatibility */
function inlineEmailStyles(html: string): string {
  const tagStyles: Record<string, string> = {
    h1: "color:#1a1a2e;font-size:24px;font-weight:bold;margin:20px 0 12px;font-family:'Space Grotesk',Arial,sans-serif;line-height:1.3",
    h2: "color:#1a1a2e;font-size:20px;font-weight:bold;margin:16px 0 10px;font-family:'Space Grotesk',Arial,sans-serif;line-height:1.3",
    h3: "color:#1a1a2e;font-size:16px;font-weight:bold;margin:14px 0 8px;font-family:'Space Grotesk',Arial,sans-serif;line-height:1.3",
    p: "color:#333333;font-size:14px;line-height:24px;margin:8px 0",
    ul: "color:#333333;font-size:14px;line-height:24px;margin:8px 0;padding-left:24px",
    ol: "color:#333333;font-size:14px;line-height:24px;margin:8px 0;padding-left:24px",
    li: "color:#333333;font-size:14px;line-height:24px;margin:4px 0",
    hr: "border:none;border-top:1px solid #e5e5e5;margin:24px 0",
    blockquote: "border-left:3px solid #0fa968;margin:16px 0;padding:8px 16px;color:#555555;font-style:italic",
    strong: "font-weight:bold",
    em: "font-style:italic",
  };

  let result = html;

  // Process self-closing tags (hr)
  result = result.replace(/<hr\s*\/?>/gi, `<hr style="${tagStyles.hr}" />`);

  // Process tags with existing style attributes — merge styles
  for (const [tag, styles] of Object.entries(tagStyles)) {
    if (tag === "hr") continue;
    // Tags that already have a style attribute
    const withStyleRe = new RegExp(`<${tag}(\\s[^>]*)style="([^"]*)"([^>]*)>`, "gi");
    result = result.replace(withStyleRe, (_, before, existingStyle, after) => {
      return `<${tag}${before}style="${styles};${existingStyle}"${after}>`;
    });
    // Tags without a style attribute — only add if no style was already added
    const noStyleRe = new RegExp(`<${tag}((?:\\s(?!style=)[^>]*)?)>`, "gi");
    result = result.replace(noStyleRe, (match, attrs) => {
      if (match.includes('style="')) return match;
      return `<${tag}${attrs || ""} style="${styles}">`;
    });
  }

  // Process <a> tags specially — CTA buttons vs regular links
  const ctaColorMap: Record<string, string> = {
    green: "#0fa968",
    blue: "#2563eb",
    black: "#18181b",
  };
  const aStyle = "color:#0fa968;text-decoration:underline";

  // First handle CTA links (data-cta="true")
  result = result.replace(/<a\s([^>]*data-cta="true"[^>]*)>/gi, (match, attrs) => {
    const colorMatch = attrs.match(/data-cta-color="([^"]*)"/i);
    const bg = ctaColorMap[colorMatch?.[1] ?? ""] ?? "#0fa968";
    const ctaStyle = `display:inline-block;background-color:${bg};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;font-family:'Space Grotesk',Arial,sans-serif;text-align:center`;
    const cleanAttrs = attrs.replace(/style="[^"]*"/gi, "").trim();
    return `<a ${cleanAttrs} style="${ctaStyle}">`;
  });

  // Then handle regular links (without data-cta)
  result = result.replace(/<a\s([^>]*)style="([^"]*)"([^>]*)>/gi, (match, before, existing, after) => {
    if (match.includes('data-cta')) return match; // already handled
    return `<a ${before}style="${aStyle};${existing}"${after}>`;
  });
  result = result.replace(/<a\s((?:(?!style=)[^>])*)>/gi, (match, attrs) => {
    if (match.includes('style="') || match.includes('data-cta')) return match;
    return `<a ${attrs} style="${aStyle}">`;
  });

  return result;
}

/** Wrap raw editor HTML in email document shell (no inline styles — for editing state) */
function wrapInEmailShell(richHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0"><div style="max-width:480px;margin:0 auto;padding:20px 12px">${richHtml}</div></body></html>`;
}

/** Wrap raw editor HTML with full inline styles (for save/send/preview) */
function wrapInEmailDocument(richHtml: string): string {
  return wrapInEmailShell(inlineEmailStyles(richHtml));
}

/** Extract inner body content from full email HTML and strip inline styles so editor gets clean HTML */
function extractBodyContent(fullHtml: string): string {
  let inner = fullHtml;
  // Try to extract content inside the inner wrapper div
  const match = fullHtml.match(/<div[^>]*style="[^"]*max-width[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/body>/i);
  if (match) {
    inner = match[1];
  } else {
    const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) inner = bodyMatch[1];
  }
  // Strip inline style attributes from semantic tags so the editor works with clean HTML
  // Preserve style on tags that have text-align (editor uses it)
  inner = inner.replace(/<(h[1-3]|p|ul|ol|li|hr|blockquote|strong|em)(\s[^>]*)?\sstyle="([^"]*)"([^>]*)>/gi,
    (match, tag, before = "", styleVal, after = "") => {
      // Keep text-align styles — the editor needs them
      const alignMatch = styleVal.match(/text-align:\s*\w+/);
      if (alignMatch) {
        return `<${tag}${before} style="${alignMatch[0]}"${after}>`;
      }
      return `<${tag}${before}${after}>`;
    }
  );
  // Strip style from <a> tags that are NOT CTA buttons (regular links get restyled on save)
  inner = inner.replace(/<a\s([^>]*)style="([^"]*)"([^>]*)>/gi, (match, before, _style, after) => {
    if (match.includes("data-cta")) return match; // keep CTA inline styles
    return `<a ${before}${after}>`.replace(/\s+>/g, ">").replace(/\s{2,}/g, " ");
  });
  return inner;
}

const NY = "ny";

const newTemplate = (): EmailTemplate => ({
  id: "",
  name: "",
  subject: "",
  body_html: "",
  sender_name: "The Boardroom",
  sender_email: "noreply@mail.topix.dk",
  trigger_type: "manual",
  trigger_config: {},
  enabled: true,
  variables: [],
  created_at: "",
  updated_at: "",
});

// ─── Faner — NY FORM i huset (filhovedet), kan løftes til hjemmebane/ ───
type Fane = "visual" | "code" | "preview" | "trigger" | "settings";
const FANER: { value: Fane; label: string }[] = [
  { value: "visual", label: "Visuel redigering" },
  { value: "code", label: "HTML" },
  { value: "preview", label: "Preview" },
  { value: "trigger", label: "Trigger" },
  { value: "settings", label: "Indstillinger" },
];

/** Fane-linje som segmented control over ét panel. Segmentet bærer
    radiogroup-semantikken og pilenavigationen; panelet er tabpanel. */
const HbFaner = <T extends string>({
  value,
  options,
  onChange,
  label,
  children,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  children: React.ReactNode;
}) => (
  <div>
    <HbSegmented aria-label={label} value={value} options={options} onChange={onChange} />
    <div role="tabpanel" className="mt-4">
      {children}
    </div>
  </div>
);

// ─── Editoren (højre side) — TemplateEditor :770-1140 i Hb-udtryk ──────────
const SkabelonEditor = forwardRef<
  EditorHandle,
  {
    template: EmailTemplate;
    saving: boolean;
    onSave: (t: Partial<EmailTemplate>) => void;
    onDirtyChange: (dirty: boolean) => void;
    onDuplicate: (t: EmailTemplate) => void;
    onSendTestToMe: (t: EmailTemplate) => void;
    sendingTestToMe: boolean;
    onToggleEnabled: (id: string, enabled: boolean) => Promise<void>;
    onDelete: (id: string) => void;
    deleting: boolean;
    savedAt: Date | null;
  }
>(({ template, saving, onSave, onDirtyChange, onDuplicate, onSendTestToMe, sendingTestToMe, onToggleEnabled, onDelete, deleting, savedAt }, ref) => {
  const [form, setForm] = useState({ ...template });
  const [fane, setFane] = useState<Fane>("visual");
  const [variableInput, setVariableInput] = useState({ key: "", example: "", description: "" });
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof EmailTemplate>(key: K, value: EmailTemplate[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const dirty = useMemo(() => {
    const felter: (keyof EmailTemplate)[] = ["name", "subject", "body_html", "sender_name", "sender_email", "trigger_type", "trigger_config", "enabled", "variables"];
    return felter.some((k) => JSON.stringify(form[k]) !== JSON.stringify(template[k]));
  }, [form, template]);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // For rich text: extract body content from full HTML for editing
  const richContent = extractBodyContent(form.body_html);

  const handleRichTextChange = useCallback((html: string) => {
    // Store raw HTML during editing — inline styles applied on save/preview
    setForm((f) => ({ ...f, body_html: wrapInEmailShell(html) }));
  }, []);

  const parseCronDay = () => {
    const m = (form.trigger_config?.schedule || "").match(/^\d+\s+\d+\s+(\d+)/);
    return m ? parseInt(m[1]) : 5;
  };
  const parseCronHour = () => {
    const m = (form.trigger_config?.schedule || "").match(/^\d+\s+(\d+)/);
    return m ? parseInt(m[1]) : 8;
  };

  const setCron = (day: number, hour: number) => {
    const schedule = `0 ${hour} ${day} * *`;
    const description = `Den ${day}. i hver måned kl. ${String(hour).padStart(2, "0")}:00`;
    update("trigger_config", { schedule, description });
  };

  const addVariable = () => {
    if (!variableInput.key.trim()) {
      toast.error("Udfyld nøgle-feltet først");
      return;
    }
    update("variables", [...form.variables, { ...variableInput }]);
    setVariableInput({ key: "", example: "", description: "" });
  };

  const removeVariable = (idx: number) => {
    update("variables", form.variables.filter((_, i) => i !== idx));
  };

  const buildPayload = (extra: Partial<EmailTemplate> = {}): Partial<EmailTemplate> | null => {
    const next = { ...form, ...extra };
    if (!next.name.trim()) {
      toast.error("Navn er påkrævet");
      setError("Navn er påkrævet");
      return null;
    }
    setError(null);
    // Apply inline styles on save so emails render correctly in clients
    const rawContent = extractBodyContent(next.body_html);
    const styledBodyHtml = wrapInEmailDocument(rawContent);
    const payload: Partial<EmailTemplate> = {
      name: next.name,
      subject: next.subject,
      body_html: styledBodyHtml,
      sender_name: next.sender_name,
      sender_email: next.sender_email,
      trigger_type: next.trigger_type,
      trigger_config: next.trigger_config,
      enabled: next.enabled,
      variables: next.variables,
    };
    if (next.id) payload.id = next.id;
    return payload;
  };

  const handleSave = () => {
    const payload = buildPayload();
    if (payload) onSave(payload);
  };

  useImperativeHandle(ref, () => ({
    save: () => handleSave(),
    // ⌘⇧P = «publicér»: aktivér og gem.
    publish: () => {
      update("enabled", true);
      const payload = buildPayload({ enabled: true });
      if (payload) onSave(payload);
    },
  }));

  const sendTest = async () => {
    if (!testEmail) return;
    if (!form.id) {
      toast.error("Gem skabelonen først, før du sender en test");
      return;
    }
    setSending(true);
    try {
      const res = await supabase.functions.invoke("send-template-email", {
        body: { template_id: form.id, test_email: testEmail },
      });
      if (res.error) throw res.error;
      toast.success(`Test-email sendt til ${testEmail}`);
    } catch (e: any) {
      toast.error(e.message || "Fejl ved afsendelse");
    } finally {
      setSending(false);
    }
  };

  // Preview always applies inline styles so it matches the final email
  const rawContent = extractBodyContent(form.body_html);
  const previewHtml = replaceVariables(wrapInEmailDocument(rawContent), form.variables);

  /* Aktivér/Deaktivér — Switch'ens (:265, :1073) afløser i EditorBars
     publicér-mønster: for en gemt skabelon skrives skiftet med det samme
     (toggleEnabled, som listens Switch gjorde); for en ny ligger det i
     kladden til første gem. */
  const skiftAktiv = async () => {
    const next = !form.enabled;
    update("enabled", next);
    if (form.id) await onToggleEnabled(form.id, next);
  };

  const actions: EditorAction[] = [
    { label: "Duplikér", variant: "link", onClick: () => onDuplicate(form) },
    ...(form.id
      ? [{ label: sendingTestToMe ? "Sender…" : "Send testmail til mig", variant: "link" as const, onClick: () => onSendTestToMe(form) }]
      : []),
    { label: form.enabled ? "Deaktivér" : "Aktivér", variant: "secondary", onClick: () => void skiftAktiv() },
  ];

  const meta =
    form.trigger_type === "cron"
      ? `${TRIGGER_LABELS.cron} · ${cronToDescription(form.trigger_config)}`
      : form.trigger_type === "event"
        ? `${TRIGGER_LABELS.event} · ${EVENT_OPTIONS.find((e) => e.value === form.trigger_config?.event)?.label ?? "Ingen hændelse valgt"}`
        : TRIGGER_LABELS.manual;

  return (
    <EditorShell
      eyebrow={form.id ? "Skabelon" : "Ny skabelon"}
      title={form.name}
      meta={meta}
      footer={
        <EditorBar
          status={form.enabled ? "published" : "draft"}
          dirty={dirty}
          saving={saving}
          savedAt={savedAt}
          error={error}
          onSave={handleSave}
          actions={actions}
          deleteSpec={
            form.id
              ? {
                  entityLabel: form.name || "skabelonen",
                  deleting,
                  onDelete: () => onDelete(form.id),
                }
              : undefined
          }
        />
      }
    >
      {/* Name + Subject */}
      <div className="grid gap-4 sm:grid-cols-2">
        <HbField label="Skabelonnavn" htmlFor="tpl-name">
          <HbInput id="tpl-name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="F.eks. Rapport-påmindelse" />
        </HbField>
        <HbField label="E-mail emne" htmlFor="tpl-subject">
          <HbInput id="tpl-subject" value={form.subject} onChange={(e) => update("subject", e.target.value)} placeholder="Brug {{variable}} som placeholders" />
        </HbField>
      </div>

      <HbFaner<Fane> value={fane} options={FANER} onChange={setFane} label="Editor-faner">
        {/* Visual editor — DEN GAMLE RichTextEditor, uændret og markeret
            (filhovedet: CTA-attributterne og text-align overlever kun her). */}
        {fane === "visual" && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-hb-line">
              <RichTextEditor content={richContent} onChange={handleRichTextChange} />
            </div>
            {form.variables.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-hb-ink-soft">Variable:</span>
                {form.variables.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    title={v.description}
                    onClick={() => {
                      navigator.clipboard.writeText(`{{${v.key}}}`);
                      toast.success(`{{${v.key}}} kopieret — indsæt i editoren`);
                    }}
                  >
                    <HbTag className="cursor-pointer px-2 py-0.5 font-mono text-[11px]">{"{{" + v.key + "}}"}</HbTag>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* HTML code editor — rå HTML i en rolig ramme */}
        {fane === "code" && (
          <HbTextarea
            value={form.body_html}
            onChange={(e) => update("body_html", e.target.value)}
            className="min-h-[400px] font-mono text-xs"
            placeholder="<html>...</html>"
            aria-label="HTML"
          />
        )}

        {/* Preview — samme sandboxede iframe som før, i HbCard-ramme */}
        {fane === "preview" && (
          <HbCard className="overflow-hidden p-0">
            <iframe
              srcDoc={previewHtml}
              className="min-h-[400px] w-full border-0 bg-white"
              title="Email preview"
              sandbox=""
            />
          </HbCard>
        )}

        {/* Trigger */}
        {fane === "trigger" && (
          <div className="space-y-5">
            <HbField label="Trigger-type" htmlFor="tpl-trigger" className="max-w-xs">
              <HbSelect id="tpl-trigger" value={form.trigger_type} onChange={(e) => update("trigger_type", e.target.value)}>
                <option value="cron">Tidsplan (cron)</option>
                <option value="event">Hændelse</option>
                <option value="manual">Manuel</option>
              </HbSelect>
            </HbField>

            {form.trigger_type === "cron" && (
              <HbCard className="space-y-3 p-5">
                <p className="text-sm text-hb-ink-soft">Vælg hvornår e-mailen skal sendes automatisk</p>
                <div className="flex flex-wrap items-end gap-4">
                  <HbField label="Dag i måneden" htmlFor="tpl-cron-day">
                    <HbSelect id="tpl-cron-day" value={String(parseCronDay())} onChange={(e) => setCron(parseInt(e.target.value), parseCronHour())} className="w-32">
                      {CRON_DAY_OPTIONS.map((d) => (
                        <option key={d} value={String(d)}>Den {d}.</option>
                      ))}
                    </HbSelect>
                  </HbField>
                  <HbField label="Tidspunkt (UTC)" htmlFor="tpl-cron-hour">
                    <HbSelect id="tpl-cron-hour" value={String(parseCronHour())} onChange={(e) => setCron(parseCronDay(), parseInt(e.target.value))} className="w-32">
                      {CRON_HOUR_OPTIONS.map((h) => (
                        <option key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</option>
                      ))}
                    </HbSelect>
                  </HbField>
                </div>
                <p className="text-xs text-hb-ink-soft">{cronToDescription(form.trigger_config)}</p>
              </HbCard>
            )}

            {form.trigger_type === "event" && (
              <div className="space-y-4">
                <HbField label="Hændelse" htmlFor="tpl-event" className="max-w-sm">
                  <HbSelect
                    id="tpl-event"
                    value={form.trigger_config?.event || ""}
                    onChange={(e) => update("trigger_config", { ...form.trigger_config, event: e.target.value })}
                  >
                    <option value="">Vælg hændelse</option>
                    {EVENT_OPTIONS.map((e) => (
                      <option key={e.value} value={e.value}>{e.label}</option>
                    ))}
                  </HbSelect>
                </HbField>

                {form.trigger_config?.event === "membership_days" && (
                  <HbField
                    label="Antal dage efter medlemsskabs-start"
                    htmlFor="tpl-days"
                    help="E-mailen sendes automatisk X dage efter virksomhedens start_date"
                    className="max-w-xs"
                  >
                    <HbInput
                      id="tpl-days"
                      type="number"
                      min={1}
                      max={365}
                      className="w-32"
                      value={form.trigger_config?.days || 30}
                      onChange={(e) => update("trigger_config", { ...form.trigger_config, days: parseInt(e.target.value) || 30 })}
                    />
                  </HbField>
                )}
              </div>
            )}

            {form.trigger_type === "manual" && (
              <p className="text-sm text-hb-ink-soft">Denne skabelon sendes manuelt via "Send test" herunder.</p>
            )}
          </div>
        )}

        {/* Settings */}
        {fane === "settings" && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <HbField label="Afsendernavn" htmlFor="tpl-sender-name">
                <HbInput id="tpl-sender-name" value={form.sender_name} onChange={(e) => update("sender_name", e.target.value)} />
              </HbField>
              <HbField label="Afsender e-mail" htmlFor="tpl-sender-email">
                <HbInput id="tpl-sender-email" value={form.sender_email} onChange={(e) => update("sender_email", e.target.value)} />
              </HbField>
            </div>
            <p className="text-xs text-hb-ink-soft">
              Skabelon aktiv: <span className="text-hb-ink">{form.enabled ? "ja" : "nej"}</span> — skiftes med «{form.enabled ? "Deaktivér" : "Aktivér"}» i bundlinjen.
            </p>

            <HbCard className="p-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Variable (placeholders)</p>
              <div className="mt-3 space-y-2">
                {form.variables.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <code className="rounded bg-hb-sage/50 px-2 py-0.5 text-xs text-hb-ink">{`{{${v.key}}}`}</code>
                    <span className="min-w-0 flex-1 truncate text-hb-ink-soft">{v.description}</span>
                    <span className="text-xs text-hb-ink-soft">Eks: {v.example}</span>
                    <button
                      type="button"
                      onClick={() => removeVariable(i)}
                      className="px-1 text-xs text-hb-ink-soft underline-offset-4 hover:text-hb-rust hover:underline"
                    >
                      Fjern
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <HbField label="Nøgle" htmlFor="tpl-var-key" className="min-w-[8rem] flex-1">
                  <HbInput id="tpl-var-key" className="py-2 text-xs" value={variableInput.key} onChange={(e) => setVariableInput((v) => ({ ...v, key: e.target.value }))} placeholder="company_name" />
                </HbField>
                <HbField label="Eksempel" htmlFor="tpl-var-example" className="min-w-[8rem] flex-1">
                  <HbInput id="tpl-var-example" className="py-2 text-xs" value={variableInput.example} onChange={(e) => setVariableInput((v) => ({ ...v, example: e.target.value }))} placeholder="Test A/S" />
                </HbField>
                <HbField label="Beskrivelse" htmlFor="tpl-var-desc" className="min-w-[8rem] flex-1">
                  <HbInput id="tpl-var-desc" className="py-2 text-xs" value={variableInput.description} onChange={(e) => setVariableInput((v) => ({ ...v, description: e.target.value }))} placeholder="Virksomhedens navn" />
                </HbField>
                <HbButton variant="secondary" className="h-9 px-3 text-sm" onClick={addVariable} aria-label="Tilføj variabel">
                  <Plus className="h-3.5 w-3.5" />
                </HbButton>
              </div>
            </HbCard>
          </div>
        )}
      </HbFaner>

      {/* Inline test sender – always visible */}
      <HbCard className="border-dashed p-5">
        <div className="flex flex-wrap items-end gap-3">
          <HbField label="Send test-email" htmlFor="tpl-test-email" className="min-w-[200px] max-w-xs flex-1" help={!form.id ? "Gem skabelonen først" : undefined}>
            <HbInput
              id="tpl-test-email"
              type="email"
              placeholder="din@email.dk"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendTest()}
            />
          </HbField>
          <HbButton className="h-[46px] px-5 text-sm" onClick={sendTest} disabled={sending || !testEmail || !form.id}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
          </HbButton>
        </div>
      </HbCard>
    </EditorShell>
  );
});
SkabelonEditor.displayName = "SkabelonEditor";

// ─── Oversigten (højre side, ingen skabelon valgt) ─────────────────────────
const LogRaekkeSkelet = () => (
  <li aria-hidden className="px-4 py-3">
    <div className="h-4 w-2/5 animate-pulse rounded bg-hb-line/60" />
    <div className="mt-2 h-3 w-1/4 animate-pulse rounded bg-hb-line/40" />
  </li>
);

const LOG_GRID = "sm:grid-cols-[7rem_1.4fr_1.6fr_5rem_1fr]";

export const EmailTemplatesView = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nyKladde, setNyKladde] = useState<EmailTemplate | null>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [sendingTestId, setSendingTestId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorHandle>(null);

  const handleSendDigest = async () => {
    if (sendingDigest) return;
    setSendingDigest(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-monthly-digest", {
        body: {},
      });
      if (error) throw error;
      toast.success(`Digest sendt til ${data.sent} founders`);
    } catch {
      toast.error("Digest kunne ikke sendes");
    }
    setSendingDigest(false);
  };

  const handleSendTest = async (t: EmailTemplate) => {
    if (sendingTestId) return;
    const email = user?.email;
    if (!email) {
      toast.error("Kunne ikke finde din email");
      return;
    }
    setSendingTestId(t.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-template-email", {
        body: { template_id: t.id, test_email: email },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Testmail sendt til ${email}`);
    } catch (e: any) {
      toast.error(e?.message || "Testmail kunne ikke sendes");
    } finally {
      setSendingTestId(null);
    }
  };

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates" as any)
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as EmailTemplate[];
    },
  });

  // Sådning af tabellen — ordret fra EmailTemplates.tsx:394-488.
  useEffect(() => {
    if (isLoading || !user) return;

    const REQUIRED_TEMPLATES = [
      {
        name: "Rapport-påmindelse (venlig)",
        subject: "Husk: Upload din rapport for {{period}}",
        body_html: "Hej {{first_name}} — vi har endnu ikke modtaget din rapport for {{period}}. Det tager under 2 minutter, og vi trækker tallene ud automatisk.\n\nUpload rapport →",
        trigger_type: "cron",
        trigger_config: { schedule: "0 9 7 * *", description: "Dag 7 i måneden" },
        enabled: false,
      },
      {
        name: "Rapport-påmindelse (presserende)",
        subject: "Din rapport for {{period}} mangler stadig",
        body_html: "Hej {{first_name}} — din rapport for {{period}} er stadig ikke modtaget. Upload den snarest så vi kan følge med i udviklingen og give dig den bedste sparring.\n\nUpload rapport →",
        trigger_type: "cron",
        trigger_config: { schedule: "0 9 15 * *", description: "Dag 15 i måneden" },
        enabled: false,
      },
      {
        name: "Rapport-påmindelse (kritisk)",
        subject: "Vigtigt: {{period}}-rapport er nu forsinket",
        body_html: "Hej {{first_name}} — vi mangler fortsat din rapport for {{period}}. Upload den hurtigst muligt.\n\nUpload rapport →",
        trigger_type: "cron",
        trigger_config: { schedule: "0 9 20 * *", description: "Dag 20 i måneden" },
        enabled: false,
      },
      {
        name: "Velkomstbesked",
        subject: "Velkomstbesked",
        body_html: "Hej {{first_name}}! Velkommen til The Boardroom 🎉 Vi glæder os til at følge din rejse og give dig sparring undervejs. Det bedste du kan gøre nu er at uploade din seneste regnskabsrapport — så har vi et fælles udgangspunkt at arbejde ud fra. Spørg endelig hvis der er noget.",
        trigger_type: "event",
        trigger_config: { event: "user_onboarded" },
        enabled: false,
      },
      {
        name: "Notifikation: Ny besked fra rådgiver",
        subject: "Ny besked fra din rådgiver",
        body_html: "{{body}}",
        trigger_type: "event",
        trigger_config: { event: "advisor_replied" },
        enabled: false,
      },
      {
        name: "Notifikation: Rapport klar til gennemsyn",
        subject: "Dine tal er klar til gennemsyn",
        body_html: "{{body}}",
        trigger_type: "event",
        trigger_config: { event: "report_review_ready" },
        enabled: false,
      },
      {
        name: "Notifikation: Rapport fejl",
        subject: "Din rapport kunne ikke behandles",
        body_html: "{{body}}",
        trigger_type: "event",
        trigger_config: { event: "report_error" },
        enabled: false,
      },
      {
        name: "Notifikation: Rapport godkendt",
        subject: "Nyt commit fra dit boardroom-medlem",
        body_html: "{{body}}",
        trigger_type: "event",
        trigger_config: { event: "report_committed" },
        enabled: false,
      },
      {
        name: "Notifikation: Milestone fuldført",
        subject: "Milestone fuldført",
        body_html: "{{body}}",
        trigger_type: "event",
        trigger_config: { event: "milestone_completed" },
        enabled: false,
      },
    ];

    const existingNames = new Set(templates.map((t: any) => t.name));
    const missing = REQUIRED_TEMPLATES.filter(t => !existingNames.has(t.name));

    if (missing.length === 0) return;

    Promise.all(
      missing.map(tpl =>
        (supabase.from("email_templates" as any).insert({
          ...tpl,
          sender_name: "The Boardroom",
          sender_email: "noreply@mail.topix.dk",
        } as any))
      )
    ).then(() => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
    });
  }, [templates, isLoading, user, queryClient]);

  const { data: sendLog = [], isLoading: logLoading } = useQuery({
    queryKey: ["email-send-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_send_log" as any)
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as SendLogEntry[];
    },
    enabled: showLog,
  });

  const saveMutation = useMutation({
    mutationFn: async (template: Partial<EmailTemplate> & { id?: string }) => {
      const payload = { ...template, updated_by: user?.id };
      if (template.id) {
        const { error } = await supabase
          .from("email_templates" as any)
          .update(payload as any)
          .eq("id", template.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("email_templates" as any)
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setSavedAt(new Date());
      // Som før (:522): editoren lukkes efter gem. En ny skabelon har
      // intet id at blive stående på; en gemt vender tilbage til listen.
      setSelectedId(null);
      setNyKladde(null);
      toast.success("Skabelon gemt");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("email_templates" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setSelectedId(null);
      toast.success("Skabelon slettet");
    },
  });

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await supabase
      .from("email_templates" as any)
      .update({ enabled } as any)
      .eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["email-templates"] });
  };

  const duplicate = (t: EmailTemplate) => {
    const dup = {
      ...newTemplate(),
      name: `${t.name} (kopi)`,
      subject: t.subject,
      body_html: t.body_html,
      sender_name: t.sender_name,
      sender_email: t.sender_email,
      trigger_type: t.trigger_type,
      trigger_config: { ...t.trigger_config },
      variables: [...t.variables],
    };
    setNyKladde(dup);
    setSelectedId(NY);
  };

  const opretNy = () => {
    setNyKladde(newTemplate());
    setSelectedId(NY);
  };

  useAdminHotkeys({
    onSave: () => editorRef.current?.save(),
    onPublish: () => editorRef.current?.publish(),
    onNew: opretNy,
    onSearch: () => searchRef.current?.focus(),
    onEscape: () => setSelectedId(null),
  });

  // ── Venstre: listen (TemplateList :206-335 som HbTreeList-rækker) ─────
  const query = search.trim().toLowerCase();
  const rows: HbListRow[] = useMemo(() => {
    const liste = templates
      .filter((t) => !query || t.name.toLowerCase().includes(query) || (t.subject || "").toLowerCase().includes(query))
      .map((t) => ({
        id: t.id,
        kind: "template",
        depth: 0,
        title: t.name || "Uden titel",
        meta: [
          TRIGGER_LABELS[t.trigger_type] || TRIGGER_LABELS.manual,
          t.trigger_type === "cron" ? cronToDescription(t.trigger_config) : null,
          t.subject,
        ]
          .filter(Boolean)
          .join(" · "),
        status: t.enabled ? "published" : "draft",
        groupKey: "templates",
        canReorder: false,
      }));
    if (nyKladde && selectedId === NY) {
      liste.unshift({
        id: NY,
        kind: "template",
        depth: 0,
        title: nyKladde.name || "Ny skabelon",
        meta: "Ikke gemt endnu",
        status: nyKladde.enabled ? "published" : "draft",
        groupKey: "templates",
        canReorder: false,
      });
    }
    return liste;
  }, [templates, query, nyKladde, selectedId]);

  const selected = selectedId === NY ? nyKladde : templates.find((t) => t.id === selectedId);
  const dirtyIds = useMemo(() => (dirty && selectedId ? new Set([`template:${selectedId}`]) : new Set<string>()), [dirty, selectedId]);

  const oversigt = (
    <div className="flex h-full min-h-0 flex-col bg-hb-surface">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <div className="max-w-2xl space-y-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Platform</p>
            <h2 className="mt-2 font-editorial text-2xl font-medium leading-tight text-hb-ink md:text-3xl">E-mail skabeloner</h2>
            <p className="mt-1.5 text-sm text-hb-ink-soft">Administrer og tilpas alle e-mails herfra. Vælg en skabelon i listen — eller opret ny (n).</p>
          </div>

          {/* Info — samme tekst som før (:589-601) */}
          <div className="rounded-hb border border-hb-line bg-hb-sage/30 p-4 text-sm">
            <p className="font-medium text-hb-ink">Skabeloner overstyrer indbyggede standardmails</p>
            <p className="mt-1 leading-relaxed text-hb-ink-soft">
              Når en skabelon er aktiveret her, bruges dens indhold i stedet for den indbyggede standardmail.
              For at nulstille til standarden kan du <strong className="font-medium text-hb-ink">slette</strong> eller <strong className="font-medium text-hb-ink">deaktivere</strong> skabelonen —
              så bruges det indbyggede branded design automatisk.
            </p>
          </div>

          {/* Månedlig digest */}
          <HbCard className="flex flex-wrap items-center gap-4 p-5">
            <div className="min-w-0 flex-1">
              <h3 className="font-editorial text-lg font-medium text-hb-ink">Månedlig digest</h3>
              <p className="mt-0.5 text-sm text-hb-ink-soft">
                Sendes automatisk den 5. i hver måned kl. 08:00. Brug knappen til at sende manuelt nu.
              </p>
            </div>
            <HbButton variant="secondary" className="h-9 shrink-0 px-4 text-sm" onClick={handleSendDigest} disabled={sendingDigest}>
              {sendingDigest ? "Sender..." : "Send digest nu"}
            </HbButton>
          </HbCard>

          {/* Send log — grid-listen (EmailLogView-formen), fem kolonner */}
          <div>
            <HbButton variant="secondary" className="h-9 px-4 text-sm" onClick={() => setShowLog((v) => !v)}>
              {showLog ? "Skjul sendt-log" : "Vis sendt-log"}
            </HbButton>
            {showLog && (
              <div className="mt-3 overflow-hidden rounded-hb border border-hb-line bg-hb-surface">
                <div className={cn("hidden border-b border-hb-line px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft sm:grid sm:gap-x-4", LOG_GRID)}>
                  <span>Tidspunkt</span>
                  <span>Modtager</span>
                  <span>Emne</span>
                  <span>Status</span>
                  <span>Type</span>
                </div>
                {logLoading ? (
                  <ul className="divide-y divide-hb-line">
                    <LogRaekkeSkelet />
                    <LogRaekkeSkelet />
                    <LogRaekkeSkelet />
                  </ul>
                ) : sendLog.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-hb-ink-soft">Ingen afsendelser endnu</p>
                ) : (
                  <ul className="divide-y divide-hb-line">
                    {sendLog.map((log) => {
                      const tplName = templates.find((t) => t.id === log.template_id)?.name;
                      return (
                        <li key={log.id} className={cn("grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 sm:items-center", LOG_GRID)}>
                          <p className="whitespace-nowrap text-xs text-hb-ink-soft">
                            {format(new Date(log.sent_at), "d. MMM yyyy HH:mm", { locale: da })}
                          </p>
                          <p className="truncate text-sm text-hb-ink">{log.recipient_email}</p>
                          <p className="truncate text-sm text-hb-ink-soft">{log.subject}</p>
                          <div>
                            {log.status === "sent" ? (
                              <HbTag className="bg-hb-evergreen/10 px-2 py-0.5 text-[11px] text-hb-evergreen">Sendt</HbTag>
                            ) : (
                              <HbTag className="bg-hb-rust/10 px-2 py-0.5 text-[11px] text-hb-rust">Fejl</HbTag>
                            )}
                          </div>
                          <div className="min-w-0">
                            {log.is_test ? (
                              <HbTag className="border border-hb-line bg-hb-paper px-2 py-0.5 text-[11px] text-hb-ink-soft">Test</HbTag>
                            ) : (
                              <span className="block truncate text-xs text-hb-ink-soft">{tplName || "Produktion"}</span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Platform URL reference */}
          <HbCard className="p-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Platform-links til brug i skabeloner</p>
            <p className="mt-2 text-xs text-hb-ink-soft">
              Brug disse links som variable i dine e-mail skabeloner. Klik for at kopiere.
            </p>
            <ul className="mt-3 divide-y divide-hb-line/60">
              {PLATFORM_URLS.map((u) => (
                <li key={u.variable}>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(u.url);
                      toast.success(`${u.url} kopieret`);
                    }}
                    className="flex w-full flex-wrap items-center gap-3 py-2 text-left text-sm transition-colors hover:bg-hb-sage/20"
                  >
                    <code className="shrink-0 rounded bg-hb-sage/50 px-2 py-0.5 text-xs text-hb-ink">{`{{${u.variable}}}`}</code>
                    <span className="min-w-0 flex-1 truncate text-hb-ink-soft">{u.description}</span>
                    <span className="font-mono text-xs text-hb-ink-soft">{u.url}</span>
                  </button>
                </li>
              ))}
            </ul>
          </HbCard>
        </div>
      </div>
    </div>
  );

  return (
    <HbAdminSplit
      editorOpen={selected != null}
      onCloseEditor={() => setSelectedId(null)}
      list={
        <HbTreeList
          rows={rows}
          archivedRows={[]}
          selectedId={selectedId}
          onSelect={(row) => setSelectedId(row.id)}
          onMoveStep={() => undefined}
          onDropOn={() => undefined}
          dirtyIds={dirtyIds}
          searchValue={search}
          onSearchChange={setSearch}
          searchRef={searchRef}
          headerAction={
            <button
              type="button"
              onClick={opretNy}
              className="flex shrink-0 items-center gap-1 rounded-full border border-hb-line px-3 py-2 text-sm text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
            >
              <Plus className="h-3.5 w-3.5" /> Skabelon
            </button>
          }
          emptyText={isLoading ? "Henter…" : "Ingen skabeloner endnu. Opret den første!"}
        />
      }
      editor={
        selected ? (
          <SkabelonEditor
            ref={editorRef}
            key={selected.id || NY}
            template={selected}
            saving={saveMutation.isPending}
            onSave={(t) => saveMutation.mutate(t)}
            onDirtyChange={setDirty}
            onDuplicate={duplicate}
            onSendTestToMe={handleSendTest}
            sendingTestToMe={sendingTestId === selected.id}
            onToggleEnabled={toggleEnabled}
            onDelete={(id) => deleteMutation.mutate(id)}
            deleting={deleteMutation.isPending}
            savedAt={savedAt}
          />
        ) : (
          oversigt
        )
      }
    />
  );
};
