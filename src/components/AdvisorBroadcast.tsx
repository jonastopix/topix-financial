import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Send, ChevronDown, ChevronUp, Users } from "lucide-react";
import { toast } from "sonner";

interface Company {
  id: string;
  name: string;
}

interface AdvisorBroadcastProps {
  companies: Company[];
}

export default function AdvisorBroadcast({ companies }: AdvisorBroadcastProps) {
  const [open, setOpen] = useState(false);
  const [lastSent, setLastSent] = useState<{ count: number; at: string } | null>(null);
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [selectAll, setSelectAll] = useState(true);

  const toggleCompany = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setSelectAll(false);
  };

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    const targetIds = selectAll ? [] : [...selectedIds];
    if (!selectAll && targetIds.length === 0) {
      toast.error("Vælg mindst én virksomhed");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "advisor-broadcast",
        { body: { message: message.trim(), company_ids: targetIds } }
      );
      if (error) throw error;
      toast.success(
        `Besked sendt til ${data.sent} virksomhed${data.sent !== 1 ? "er" : ""}`
      );
      setMessage("");
      setLastSent({ count: data.sent, at: new Date().toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) });
      setOpen(false);
    } catch {
      toast.error("Beskeden kunne ikke sendes — prøv igen");
    }
    setSending(false);
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Send besked til alle
          </span>
          <span className="text-[10px] text-muted-foreground">
            ·{" "}
            {selectAll
              ? `${companies.length} virksomheder`
              : `${selectedIds.size} valgt`}
          </span>
          {lastSent && (
            <span className="text-[10px] text-muted-foreground ml-1">
              · Sidst sendt {lastSent.at} til {lastSent.count} virksomheder
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="px-5 pb-5 space-y-3">
          {/* Recipient selector */}
          <div className="rounded-lg bg-secondary/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-foreground">Modtagere</p>
              <button
                onClick={() => {
                  setSelectAll((v) => !v);
                  setSelectedIds(new Set());
                }}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                {selectAll ? "Vælg specifikke" : "Alle virksomheder"}
              </button>
            </div>
            {!selectAll && (
              <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
                {companies.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 text-xs text-foreground cursor-pointer py-1 px-1.5 rounded hover:bg-secondary/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleCompany(c.id)}
                      className="h-3.5 w-3.5 rounded accent-primary"
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Message input */}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Skriv din besked til founders..."
            rows={4}
            maxLength={2000}
            className="w-full px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {message.length}/2000
            </span>
            <button
              onClick={handleSend}
              disabled={!message.trim() || sending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              {sending ? "Sender..." : "Send besked"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
