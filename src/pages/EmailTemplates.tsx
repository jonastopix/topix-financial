import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import RichTextEditor from "@/components/RichTextEditor";
import {
  Plus, Mail, Send, Pencil, Trash2, Clock, Zap, Hand,
  Code, Eye, Settings2, ArrowLeft, Type, Loader2, History,
  CheckCircle, XCircle, FlaskConical, Copy, Info, Link,
} from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

const TRIGGER_LABELS: Record<string, { label: string; icon: typeof Clock }> = {
  cron: { label: "Tidsplan", icon: Clock },
  event: { label: "Hændelse", icon: Zap },
  manual: { label: "Manuel", icon: Hand },
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
  { label: "Signup / Accept invitation", url: "https://topix.lovable.app/auth", variable: "signup_url", description: "Link til login/signup – bruges i invitationer" },
  { label: "Rapportering", url: "https://topix.lovable.app/reports", variable: "report_url", description: "Link til rapport-upload – bruges i påmindelser" },
  { label: "Dashboard", url: "https://topix.lovable.app/", variable: "dashboard_url", description: "Link til forsiden / dashboard" },
  { label: "Milepæle", url: "https://topix.lovable.app/milestones", variable: "milestones_url", description: "Link til milepæle-oversigt" },
  { label: "Budget", url: "https://topix.lovable.app/budget", variable: "budget_url", description: "Link til budget-oversigt" },
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
    // Tags without a style attribute
    const withoutStyleRe = new RegExp(`<${tag}(\\s[^>]*)?>(?!.*style=)`, "gi");
    // More precise: only add if no style was already added
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

// ---------- Template list with inline preview ----------

function TemplateList({
  templates,
  onEdit,
  onDuplicate,
  onDelete,
  onToggle,
}: {
  templates: EmailTemplate[];
  onEdit: (t: EmailTemplate) => void;
  onDuplicate: (t: EmailTemplate) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {templates.map((t) => {
        const trigger = TRIGGER_LABELS[t.trigger_type] || TRIGGER_LABELS.manual;
        const TriggerIcon = trigger.icon;
        const isOpen = previewId === t.id;
        const previewHtml = replaceVariables(
          t.body_html || wrapInEmailShell("<p style='color:#999;text-align:center'>Ingen indhold i skabelonen</p>"),
          t.variables,
        );

        return (
          <Card key={t.id} className="group">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium text-foreground truncate">{t.name}</h3>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    <TriggerIcon className="h-3 w-3 mr-1" />
                    {trigger.label}
                  </Badge>
                  {t.trigger_type === "cron" && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {cronToDescription(t.trigger_config)}
                    </span>
                  )}
                  {!t.enabled && (
                    <Badge variant="secondary" className="text-xs">Inaktiv</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate mt-0.5">{t.subject}</p>
              </div>
              <Button
                variant={isOpen ? "default" : "ghost"}
                size="icon"
                onClick={() => setPreviewId(isOpen ? null : t.id)}
                title="Preview"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Switch checked={t.enabled} onCheckedChange={(v) => onToggle(t.id, v)} />
              <Button variant="ghost" size="icon" onClick={() => onEdit(t)} title="Rediger">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDuplicate(t)} title="Duplikér">
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onDelete(t.id)}
                title="Slet"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
            {isOpen && (
              <div className="border-t bg-muted/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email preview</span>
                  <span className="text-xs text-muted-foreground ml-auto">Variable erstattet med eksempelværdier</span>
                </div>
                <div className="bg-background rounded-lg border shadow-sm overflow-hidden">
                  <div className="border-b px-4 py-2.5 flex items-center gap-3 bg-muted/50">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {replaceVariables(t.subject, t.variables)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Fra: {t.sender_name} &lt;{t.sender_email}&gt;
                      </p>
                    </div>
                  </div>
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full border-0"
                    style={{ minHeight: 320 }}
                    title={`Preview: ${t.name}`}
                    sandbox=""
                    onLoad={(e) => {
                      const frame = e.target as HTMLIFrameElement;
                      if (frame.contentDocument?.body) {
                        frame.style.height = `${Math.min(frame.contentDocument.body.scrollHeight + 32, 600)}px`;
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export default function EmailTemplates() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);

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
      setEditing(null);
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

  if (editing) {
    return (
      <TemplateEditor
        template={editing}
        onSave={(t) => saveMutation.mutate(t)}
        onCancel={() => setEditing(null)}
        saving={saveMutation.isPending}
      />
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">E-mail skabeloner</h1>
            <p className="text-sm text-muted-foreground mt-1">Administrer og tilpas alle e-mails herfra</p>
          </div>
          <Button onClick={() => setEditing(newTemplate())}>
            <Plus className="h-4 w-4 mr-2" /> Ny skabelon
          </Button>
        </div>

        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <div className="flex gap-3">
            <Info className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800 space-y-1">
              <p className="font-medium">Skabeloner overstyrer indbyggede standardmails</p>
              <p className="text-amber-700">
                Når en skabelon er aktiveret her, bruges dens indhold i stedet for den indbyggede standardmail.
                For at nulstille til standarden kan du <strong>slette</strong> eller <strong>deaktivere</strong> skabelonen — 
                så bruges det indbyggede branded design automatisk.
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-foreground">Månedlig digest</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Send et personligt overblik til alle founders — KPIs, milestones og ulæste beskeder.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendDigest}
              disabled={sendingDigest}
              className="gap-2 shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              {sendingDigest ? "Sender..." : "Send digest nu"}
            </Button>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Mail className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Ingen skabeloner endnu. Opret den første!</p>
            </CardContent>
          </Card>
        ) : (
          <TemplateList
            templates={templates}
            onEdit={setEditing}
            onDuplicate={(t) => {
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
              setEditing(dup);
            }}
            onDelete={(id) => {
              if (confirm("Slet denne skabelon?")) deleteMutation.mutate(id);
            }}
            onToggle={toggleEnabled}
          />
        )}

        {/* Send log */}
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLog((v) => !v)}
            className="gap-2"
          >
            <History className="h-3.5 w-3.5" />
            {showLog ? "Skjul sendt-log" : "Vis sendt-log"}
          </Button>

          {showLog && (
            <Card className="mt-3">
              <CardContent className="p-0">
                {logLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : sendLog.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Ingen afsendelser endnu</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tidspunkt</TableHead>
                        <TableHead>Modtager</TableHead>
                        <TableHead>Emne</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sendLog.map((log) => {
                        const tplName = templates.find((t) => t.id === log.template_id)?.name;
                        return (
                          <TableRow key={log.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {format(new Date(log.sent_at), "d. MMM yyyy HH:mm", { locale: da })}
                            </TableCell>
                            <TableCell className="text-sm">{log.recipient_email}</TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate">{log.subject}</TableCell>
                            <TableCell>
                              {log.status === "sent" ? (
                                <Badge variant="outline" className="text-xs gap-1 text-green-600">
                                  <CheckCircle className="h-3 w-3" /> Sendt
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs gap-1">
                                  <XCircle className="h-3 w-3" /> Fejl
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {log.is_test ? (
                                <Badge variant="secondary" className="text-xs gap-1">
                                  <FlaskConical className="h-3 w-3" /> Test
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">{tplName || "Produktion"}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Platform URL reference */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Link className="h-4 w-4" />
              Platform-links til brug i skabeloner
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">
              Brug disse links som variable i dine e-mail skabeloner. Klik for at kopiere.
            </p>
            {PLATFORM_URLS.map((u) => (
              <div
                key={u.variable}
                className="flex items-center gap-3 text-sm cursor-pointer hover:bg-muted/50 rounded-md p-2 -mx-2 transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(u.url);
                  toast.success(`${u.url} kopieret`);
                }}
              >
                <code className="bg-muted px-2 py-0.5 rounded text-xs shrink-0">{`{{${u.variable}}}`}</code>
                <span className="text-muted-foreground flex-1 truncate">{u.description}</span>
                <span className="text-xs font-mono text-muted-foreground">{u.url}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

// ---------- Editor component ----------

function TemplateEditor({
  template,
  onSave,
  onCancel,
  saving,
}: {
  template: EmailTemplate;
  onSave: (t: Partial<EmailTemplate>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({ ...template });
  const [variableInput, setVariableInput] = useState({ key: "", example: "", description: "" });
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);

  const update = <K extends keyof EmailTemplate>(key: K, value: EmailTemplate[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

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

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Navn er påkrævet");
      return;
    }
    // Apply inline styles on save so emails render correctly in clients
    const rawContent = extractBodyContent(form.body_html);
    const styledBodyHtml = wrapInEmailDocument(rawContent);
    const payload: Partial<EmailTemplate> = {
      name: form.name,
      subject: form.subject,
      body_html: styledBodyHtml,
      sender_name: form.sender_name,
      sender_email: form.sender_email,
      trigger_type: form.trigger_type,
      trigger_config: form.trigger_config,
      enabled: form.enabled,
      variables: form.variables,
    };
    if (form.id) payload.id = form.id;
    onSave(payload);
  };

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

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-display font-bold text-foreground">
            {form.id ? "Rediger skabelon" : "Ny skabelon"}
          </h1>
          <div className="flex-1" />
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Gemmer..." : "Gem skabelon"}
          </Button>
        </div>

        {/* Name + Subject */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Skabelonnavn</Label>
            <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="F.eks. Rapport-påmindelse" />
          </div>
          <div>
            <Label>E-mail emne</Label>
            <Input value={form.subject} onChange={(e) => update("subject", e.target.value)} placeholder="Brug {{variable}} som placeholders" />
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="visual" className="w-full">
          <TabsList>
            <TabsTrigger value="visual"><Type className="h-3.5 w-3.5 mr-1.5" />Visuel redigering</TabsTrigger>
            <TabsTrigger value="code"><Code className="h-3.5 w-3.5 mr-1.5" />HTML</TabsTrigger>
            <TabsTrigger value="preview"><Eye className="h-3.5 w-3.5 mr-1.5" />Preview</TabsTrigger>
            <TabsTrigger value="trigger"><Clock className="h-3.5 w-3.5 mr-1.5" />Trigger</TabsTrigger>
            <TabsTrigger value="settings"><Settings2 className="h-3.5 w-3.5 mr-1.5" />Indstillinger</TabsTrigger>
          </TabsList>

          {/* Visual editor */}
          <TabsContent value="visual" className="mt-3 space-y-3">
            <RichTextEditor
              content={richContent}
              onChange={handleRichTextChange}
            />
            {form.variables.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-muted-foreground self-center mr-1">Variable:</span>
                {form.variables.map((v) => (
                  <Badge
                    key={v.key}
                    variant="secondary"
                    className="text-xs font-mono cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText(`{{${v.key}}}`);
                      toast.success(`{{${v.key}}} kopieret — indsæt i editoren`);
                    }}
                    title={v.description}
                  >
                    {"{{" + v.key + "}}"}
                  </Badge>
                ))}
              </div>
            )}
          </TabsContent>

          {/* HTML code editor */}
          <TabsContent value="code" className="mt-3">
            <Textarea
              value={form.body_html}
              onChange={(e) => update("body_html", e.target.value)}
              className="font-mono text-xs min-h-[400px]"
              placeholder="<html>...</html>"
            />
          </TabsContent>

          {/* Preview */}
          <TabsContent value="preview" className="mt-3">
            <Card>
              <CardContent className="p-0">
                <iframe
                  srcDoc={previewHtml}
                  className="w-full min-h-[400px] border-0 rounded-lg"
                  title="Email preview"
                  sandbox=""
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trigger */}
          <TabsContent value="trigger" className="mt-3 space-y-4">
            <div>
              <Label>Trigger-type</Label>
              <Select value={form.trigger_type} onValueChange={(v) => update("trigger_type", v)}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cron">Tidsplan (cron)</SelectItem>
                  <SelectItem value="event">Hændelse</SelectItem>
                  <SelectItem value="manual">Manuel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.trigger_type === "cron" && (
              <Card>
                <CardContent className="py-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Vælg hvornår e-mailen skal sendes automatisk</p>
                  <div className="flex items-center gap-4">
                    <div>
                      <Label className="text-xs">Dag i måneden</Label>
                      <Select value={String(parseCronDay())} onValueChange={(v) => setCron(parseInt(v), parseCronHour())}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CRON_DAY_OPTIONS.map((d) => (
                            <SelectItem key={d} value={String(d)}>Den {d}.</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Tidspunkt (UTC)</Label>
                      <Select value={String(parseCronHour())} onValueChange={(v) => setCron(parseCronDay(), parseInt(v))}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CRON_HOUR_OPTIONS.map((h) => (
                            <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {cronToDescription(form.trigger_config)}
                  </p>
                </CardContent>
              </Card>
            )}

            {form.trigger_type === "event" && (
              <div className="space-y-4">
                <div>
                  <Label>Hændelse</Label>
                  <Select
                    value={form.trigger_config?.event || ""}
                    onValueChange={(v) => update("trigger_config", { ...form.trigger_config, event: v })}
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Vælg hændelse" />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_OPTIONS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {form.trigger_config?.event === "membership_days" && (
                  <div>
                    <Label>Antal dage efter medlemsskabs-start</Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      className="w-32"
                      value={form.trigger_config?.days || 30}
                      onChange={(e) => update("trigger_config", { ...form.trigger_config, days: parseInt(e.target.value) || 30 })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      E-mailen sendes automatisk X dage efter virksomhedens start_date
                    </p>
                  </div>
                )}
              </div>
            )}

            {form.trigger_type === "manual" && (
              <p className="text-sm text-muted-foreground">Denne skabelon sendes manuelt via "Send test" herunder.</p>
            )}
          </TabsContent>

          {/* Settings */}
          <TabsContent value="settings" className="mt-3 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Afsendernavn</Label>
                <Input value={form.sender_name} onChange={(e) => update("sender_name", e.target.value)} />
              </div>
              <div>
                <Label>Afsender e-mail</Label>
                <Input value={form.sender_email} onChange={(e) => update("sender_email", e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.enabled} onCheckedChange={(v) => update("enabled", v)} />
              <Label>Skabelon aktiv</Label>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Variable (placeholders)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {form.variables.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <code className="bg-muted px-2 py-0.5 rounded text-xs">{`{{${v.key}}}`}</code>
                    <span className="text-muted-foreground flex-1 truncate">{v.description}</span>
                    <span className="text-xs text-muted-foreground">Eks: {v.example}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeVariable(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Nøgle</Label>
                    <Input className="h-8 text-xs" value={variableInput.key} onChange={(e) => setVariableInput((v) => ({ ...v, key: e.target.value }))} placeholder="company_name" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Eksempel</Label>
                    <Input className="h-8 text-xs" value={variableInput.example} onChange={(e) => setVariableInput((v) => ({ ...v, example: e.target.value }))} placeholder="Test A/S" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Beskrivelse</Label>
                    <Input className="h-8 text-xs" value={variableInput.description} onChange={(e) => setVariableInput((v) => ({ ...v, description: e.target.value }))} placeholder="Virksomhedens navn" />
                  </div>
                  <Button size="sm" variant="outline" onClick={addVariable} className="h-8">
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Inline test sender – always visible */}
        <Card className="border-dashed">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Send className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground shrink-0">Send test-email</span>
              <Input
                type="email"
                placeholder="din@email.dk"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="max-w-xs h-9"
                onKeyDown={(e) => e.key === "Enter" && sendTest()}
              />
              <Button size="sm" onClick={sendTest} disabled={sending || !testEmail || !form.id}>
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send"}
              </Button>
              {!form.id && (
                <span className="text-xs text-muted-foreground">Gem skabelonen først</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
