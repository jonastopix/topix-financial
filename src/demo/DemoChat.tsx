import { useState } from "react";
import { Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DEMO_CHAT } from "./demoData";
import { toast } from "sonner";

export default function DemoChat() {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    toast.info("I den rigtige platform går din besked direkte til dine advisors.");
    setInput("");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-40px)] md:h-[calc(100vh-40px)]">
      <div className="p-4 md:p-6 border-b border-border shrink-0">
        <h1 className="text-lg font-bold text-foreground">Chat med dine rådgivere</h1>
        <p className="text-xs text-muted-foreground">Advisory Board sparring</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {DEMO_CHAT.map((msg, i) => {
          const isUser = msg.role === "user";
          return (
            <div key={i} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                isUser
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent text-accent-foreground"
              }`}>
                {msg.initials}
              </div>
              <div className={`max-w-[75%] ${isUser ? "text-right" : ""}`}>
                <div className="flex items-baseline gap-2 mb-1" style={{ flexDirection: isUser ? "row-reverse" : "row" }}>
                  <span className="text-xs font-semibold text-foreground">{msg.name}</span>
                  <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                </div>
                <Card className={`inline-block ${isUser ? "bg-primary text-primary-foreground" : "bg-card"} border-border`}>
                  <CardContent className="p-3 text-sm leading-relaxed">
                    {msg.text}
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-border shrink-0 bg-background">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Skriv en besked…"
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button size="icon" onClick={handleSend}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
