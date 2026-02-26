import { useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Mail, Send, Pencil, Trash2, Clock, Zap, Hand, Code, Eye, Settings2, ArrowLeft } from "lucide-react";

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
  { value: "new_user", label: "Ny bruger oprettet" },
  { value: "milestone_deadline", label: "Milestone deadline nærmer sig" },
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

export default function EmailTemplates() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testTemplateId, setTestTemplateId] = useState("");
  const [sending, setSending] = useState(false);

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

  const sendTest = async () => {
    if (!testEmail || !testTemplateId) return;
    setSending(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await supabase.functions.invoke("send-template-email", {
        body: { template_id: testTemplateId, test_email: testEmail },
      });
      if (res.error) throw res.error;
      toast.success(`Test-email sendt til ${testEmail}`);
      setTestDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Fejl ved afsendelse");
    } finally {
      setSending(false);
    }
  };

  const newTemplate = (): EmailTemplate => ({
    id: "",
    name: "",
    subject: "",
    body_html: "",
    sender_name: "The Boardroom",
    sender_email: "noreply@boardroom.topix.dk",
    trigger_type: "manual",
    trigger_config: {},
    enabled: true,
    variables: [],
    created_at: "",
    updated_at: "",
  });

  if (editing) {
    return <TemplateEditor template={editing} onSave={(t) => saveMutation.mutate(t)} onCancel={() => setEditing(null)} saving={saveMutation.isPending} />;
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">E-mail skabeloner</h1>
            <p className="text-sm text-muted-foreground mt-1">Administrer og tilpas e-mail-skabeloner</p>
          </div>
          <Button onClick={() => setEditing(newTemplate())}>
            <Plus className="h-4 w-4 mr-2" /> Ny skabelon
          </Button>
        </div>

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
          <div className="space-y-3">
            {templates.map((t) => {
              const trigger = TRIGGER_LABELS[t.trigger_type] || TRIGGER_LABELS.manual;
              const TriggerIcon = trigger.icon;
              return (
                <Card key={t.id} className="group">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
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
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{t.subject}</p>
                    </div>
                    <Switch checked={t.enabled} onCheckedChange={(v) => toggleEnabled(t.id, v)} />
                    <Button variant="ghost" size="icon" onClick={() => setEditing(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setTestTemplateId(t.id);
                        setTestDialogOpen(true);
                      }}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        if (confirm("Slet denne skabelon?")) deleteMutation.mutate(t.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send test-email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Modtager e-mail</Label>
              <Input
                type="email"
                placeholder="test@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
            </div>
            <Button onClick={sendTest} disabled={sending || !testEmail} className="w-full">
              {sending ? "Sender..." : "Send test"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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

  const update = <K extends keyof EmailTemplate>(key: K, value: EmailTemplate[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

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
    if (!variableInput.key) return;
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
    const payload: Partial<EmailTemplate> = {
      name: form.name,
      subject: form.subject,
      body_html: form.body_html,
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

  const previewHtml = replaceVariables(form.body_html, form.variables);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-4">
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

        <Tabs defaultValue="code" className="w-full">
          <TabsList>
            <TabsTrigger value="code"><Code className="h-3.5 w-3.5 mr-1.5" />HTML</TabsTrigger>
            <TabsTrigger value="preview"><Eye className="h-3.5 w-3.5 mr-1.5" />Preview</TabsTrigger>
            <TabsTrigger value="trigger"><Clock className="h-3.5 w-3.5 mr-1.5" />Trigger</TabsTrigger>
            <TabsTrigger value="settings"><Settings2 className="h-3.5 w-3.5 mr-1.5" />Indstillinger</TabsTrigger>
          </TabsList>

          <TabsContent value="code" className="mt-3">
            <Textarea
              value={form.body_html}
              onChange={(e) => update("body_html", e.target.value)}
              className="font-mono text-xs min-h-[400px]"
              placeholder="<html>...</html>"
            />
            {form.variables.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.variables.map((v) => (
                  <Badge key={v.key} variant="secondary" className="text-xs font-mono cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText(`{{${v.key}}}`);
                      toast.success(`{{${v.key}}} kopieret`);
                    }}
                  >
                    {"{{" + v.key + "}}"}
                  </Badge>
                ))}
              </div>
            )}
          </TabsContent>

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
              <div>
                <Label>Hændelse</Label>
                <Select
                  value={form.trigger_config?.event || ""}
                  onValueChange={(v) => update("trigger_config", { event: v })}
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
            )}

            {form.trigger_type === "manual" && (
              <p className="text-sm text-muted-foreground">Denne skabelon sendes manuelt via "Send test"-knappen.</p>
            )}
          </TabsContent>

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
                <CardTitle className="text-sm">Variable</CardTitle>
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
      </div>
    </AppLayout>
  );
}
