import { useState } from "react";
import { Send, CheckCheck, Sparkles, Bot, TrendingUp, DollarSign, Flame, PaperclipIcon } from "lucide-react";
import { DEMO_CHAT } from "./demoData";
import { toast } from "sonner";

const DEMO_CHAT_EXTENDED = [
  { role: "advisor", name: "Jonas Herlev", initials: "JH", time: "Man 13. jan 14:32", text: "Imponerende december, Morten! Omsætningsvæksten på 88% YoY er stærk. Har du set nærmere på, hvilke kanaler der driver den vækst?" },
  { role: "user", name: "Dig", initials: "ML", time: "Man 13. jan 15:18", text: "Tak Jonas! Det er primært vores inbound-kanal der kører nu — SEO begynder at virke. Vi får ca. 3-4 kvalificerede leads om ugen organisk." },
  { role: "advisor", name: "Jonas Herlev", initials: "JH", time: "Man 13. jan 16:05", text: "Det er guld. Organisk vækst med de marginer I har nu er præcis det vi har arbejdet hen imod. Lad os tage det op på mødet 30. april." },
  { role: "user", name: "Morten Larsen", initials: "ML", time: "Man 13. jan 16:22", text: "Perfekt. Jeg er lidt bekymret for om vi ansætter CSM for tidligt ift. likviditeten. Hvad tænker du?" },
  { role: "advisor", name: "Jonas Herlev", initials: "JH", time: "Tir 14. jan 09:11", text: "Rigtig god bekymring at have. Med 248k i bank og stigende MRR vurderer jeg at I kan absorbere en CSM fra maj. Churn-reduktionen betaler lønnen tilbage inden for 6 måneder. Jeg sender dig et regnestykke." },
  { role: "advisor", name: "Jonas Herlev", initials: "JH", time: "Tir 14. jan 09:14", text: "Husk vi har møde tirsdag 30. april kl. 10. Agenda: Q1-status, CSM-beslutning og ny salgsstrategi. Bekræft gerne." },
  { role: "user", name: "Morten Larsen", initials: "ML", time: "Tir 14. jan 09:45", text: "Bekræftet! Glæder mig. Jeg forbereder Q1-tallene inden da." },
];

const AI_MESSAGES = [
  {
    role: "ai" as const,
    text: "Hej Morten 👋 Jeg har læst dine seneste tal. Her er de tre vigtigste ting du bør fokusere på denne uge:",
    cards: [
      { icon: TrendingUp, label: "Vækst", value: "+14,8% M/M", color: "text-primary", bg: "bg-primary/10" },
      { icon: Flame, label: "EBITDA-margin", value: "20,4%", color: "text-chart-warning", bg: "bg-chart-warning/10" },
      { icon: DollarSign, label: "Bank", value: "248.000 kr.", color: "text-chart-info", bg: "bg-chart-info/10" },
    ],
  },
  {
    role: "user-ai" as const,
    text: "Hvad bør min næste prioritet være?",
  },
  {
    role: "ai" as const,
    text: "Baseret på dine tal er din vigtigste prioritet at reducere churn fra 1,2% til under 1%. Det koster dig ca. 41.000 kr. MRR om året — svarende til 12 tabte kunder. En Customer Success Manager vil sandsynligvis betale sig inden for 6 måneder med din nuværende vækstrate.",
  },
  {
    role: "user-ai" as const,
    text: "Hvornår kan jeg råde mig til at ansætte?",
  },
  {
    role: "ai" as const,
    text: "Med din nuværende banksaldo på 248.000 kr. og en månedlig likviditetsforøgelse på ca. 15-25k anbefaler jeg at vente til du har 350.000+ kr. i bank — det er du sandsynligvis ved i marts/april 2026. Det giver dig 2,5 måneders løn-buffer mens du onboarder.",
  },
];

type Pane = "advisor" | "ai";

export default function DemoChat() {
  const [input, setInput] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [pane, setPane] = useState<Pane>("advisor");

  const handleSend = () => {
    if (!input.trim()) return;
    toast.info("I den rigtige platform går din besked direkte til dine rådgivere.", {
      action: { label: "Opret konto →", onClick: () => window.open("https://theboardroom.dk", "_blank") },
    });
    setInput("");
  };

  const handleAiSend = () => {
    if (!aiInput.trim()) return;
    toast.info("I den rigtige platform svarer AI'en live på baggrund af dine egne tal.", {
      action: { label: "Opret konto →", onClick: () => window.open("https://theboardroom.dk", "_blank") },
    });
    setAiInput("");
  };

  return (
    <div className="flex h-[calc(100vh-40px)] overflow-hidden">

      {/* ── Left: conversation list (desktop only) ─────────────────── */}
      <div className="hidden md:flex flex-col w-64 shrink-0 border-r border-border bg-card/50">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Indbakke</h2>
        </div>
        <div className="flex-1 overflow-y-auto">

          {/* Advisor thread */}
          <button
            onClick={() => setPane("advisor")}
            className={`w-full text-left p-3 transition-colors ${pane === "advisor" ? "bg-primary/8 border-l-2 border-l-primary" : "hover:bg-muted/40 border-l-2 border-l-transparent"}`}
          >
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">JH</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">Morten & Jonas</p>
                <p className="text-[10px] text-muted-foreground">Advisory Board</p>
              </div>
              <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
            </div>
            <p className="text-xs text-muted-foreground truncate pl-12">Bekræft mødet 30. april…</p>
          </button>

          {/* AI thread */}
          <button
            onClick={() => setPane("ai")}
            className={`w-full text-left p-3 transition-colors ${pane === "ai" ? "bg-primary/8 border-l-2 border-l-primary" : "hover:bg-muted/40 border-l-2 border-l-transparent"}`}
          >
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">AI-finansassistent</p>
                <p className="text-[10px] text-muted-foreground">Baseret på dine tal</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground truncate pl-12">Hvornår kan jeg råde mig til…</p>
          </button>

        </div>
      </div>

      {/* ── Mobile tab bar ─────────────────────────────────────────── */}
      <div className="md:hidden absolute top-0 left-0 right-0 z-10 flex border-b border-border bg-background">
        <button onClick={() => setPane("advisor")} className={`flex-1 py-2.5 text-sm font-medium transition-colors ${pane === "advisor" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>Rådgiver</button>
        <button onClick={() => setPane("ai")} className={`flex-1 py-2.5 text-sm font-medium transition-colors ${pane === "ai" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>AI-assistent</button>
      </div>

      {/* ── Main pane ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 md:mt-0 mt-10">

        {/* Advisor chat */}
        {pane === "advisor" && (
          <>
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center gap-3 shrink-0 bg-card/50">
              <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">JH</div>
              <div>
                <p className="text-sm font-semibold text-foreground">Jonas Herlev</p>
                <p className="text-[10px] text-muted-foreground">Advisory Board · The Boardroom</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-[10px] text-muted-foreground">Online</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
              {DEMO_CHAT_EXTENDED.map((msg, i) => {
                const isUser = msg.role === "user";
                return (
                  <div key={i} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isUser ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"}`}>
                      {msg.initials}
                    </div>
                    <div className={`max-w-[75%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                      <div className={`flex items-baseline gap-2 mb-1 ${isUser ? "flex-row-reverse" : ""}`}>
                        <span className="text-xs font-semibold text-foreground">{msg.name}</span>
                        <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                      </div>
                      <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isUser ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card border border-border text-foreground rounded-bl-md"}`}>
                        {msg.text}
                      </div>
                      {isUser && (
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                          <CheckCheck className="h-3 w-3" /> Læst
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border shrink-0 bg-background">
              <div className="flex gap-2 max-w-3xl mx-auto">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Skriv til dine rådgivere…"
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button onClick={handleSend} className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors shrink-0">
                  <Send className="h-4 w-4 text-primary-foreground" />
                </button>
              </div>
            </div>
          </>
        )}

        {/* AI chat */}
        {pane === "ai" && (
          <>
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center gap-3 shrink-0 bg-card/50">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">AI-finansassistent</p>
                <p className="text-[10px] text-muted-foreground">Kender dine tal · Svarer straks</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
              {AI_MESSAGES.map((msg, i) => {
                const isUser = msg.role === "user-ai";
                return (
                  <div key={i} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
                    {!isUser && (
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                    {isUser && (
                      <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0">ML</div>
                    )}
                    <div className={`max-w-[80%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                      <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isUser ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card border border-border text-foreground rounded-bl-md"}`}>
                        {msg.text}
                        {"cards" in msg && msg.cards && (
                          <div className="grid grid-cols-3 gap-2 mt-3">
                            {msg.cards.map(c => {
                              const Icon = c.icon;
                              return (
                                <div key={c.label} className={`rounded-lg p-2 ${c.bg}`}>
                                  <Icon className={`h-3.5 w-3.5 ${c.color} mb-1`} />
                                  <p className="text-[10px] text-muted-foreground">{c.label}</p>
                                  <p className={`text-xs font-bold ${c.color}`}>{c.value}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border shrink-0 bg-background">
              <div className="flex gap-2 max-w-3xl mx-auto">
                <textarea
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAiSend(); } }}
                  placeholder="Spørg AI'en om dine tal…"
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button onClick={handleAiSend} className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors shrink-0">
                  <Send className="h-4 w-4 text-primary-foreground" />
                </button>
              </div>
              <p className="text-center text-[10px] text-muted-foreground mt-2">AI-assistent svarer ud fra dine uploadede rapporter og tal</p>
            </div>
          </>
        )}

      </div>
    </div>
  );
}