import { useState } from "react";
import { Send, CheckCheck } from "lucide-react";
import { DEMO_CHAT } from "./demoData";
import { toast } from "sonner";

export default function DemoChat() {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    toast.info("I den rigtige platform går din besked direkte til dine advisors.", {
      action: { label: "Opret konto →", onClick: () => window.open("https://theboardroom.dk", "_blank") },
    });
    setInput("");
  };

  return (
    <div className="flex h-[calc(100vh-40px)]">
      {/* Conversation list */}
      <div className="hidden md:flex flex-col w-72 border-r border-border bg-card/50">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Indbakke</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 bg-primary/5 border-l-2 border-l-primary cursor-pointer">
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                JH
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">Jonas Herlev</p>
                <p className="text-[10px] text-muted-foreground">Advisory Board</p>
              </div>
              <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
            </div>
            <p className="text-xs text-muted-foreground truncate pl-12">Det er guld. Organisk vækst med de marginer…</p>
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-border flex items-center gap-3 shrink-0 bg-card/50">
          <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
            JH
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Jonas Herlev</p>
            <p className="text-[10px] text-muted-foreground">Advisory Board · Topix</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
          {DEMO_CHAT.map((msg, i) => {
            const isUser = msg.role === "user";
            return (
              <div key={i} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isUser ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"
                }`}>
                  {msg.initials}
                </div>
                <div className={`max-w-[75%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
                  <div className={`flex items-baseline gap-2 mb-1 ${isUser ? "flex-row-reverse" : ""}`}>
                    <span className="text-xs font-semibold text-foreground">{msg.name}</span>
                    <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                  </div>
                  <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border text-foreground rounded-bl-md"
                  }`}>
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

        <div className="p-4 border-t border-border shrink-0 bg-background">
          <div className="flex gap-2 max-w-3xl mx-auto">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Skriv til dine rådgivere…"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={handleSend}
              className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors shrink-0"
            >
              <Send className="h-4 w-4 text-primary-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
