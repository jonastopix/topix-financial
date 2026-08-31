import React, { useState } from "react";
import { Smile } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { AggregatedReaction } from "@/hooks/useMessageReactions";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "🙏"];

/** variant="hb" (C4): Hjemmebane-udtrykket — evergreen som handlingsfarve,
    hb-line/sage som flade. PopoverContent er en PORTAL og renderes uden
    for .theme-hjemmebane-wrapperen; klassen sættes derfor direkte på
    Content-elementet, så hb-tokens findes derinde. Uden variant er alt
    tegn-for-tegn som før (rådgiverens mørke flade er urørt). */
export type ChatSkinVariant = "hb" | undefined;

interface ReactionBarProps {
  reactions: AggregatedReaction[];
  onToggle: (emoji: string) => void;
  isMine: boolean;
  getReactorName?: (userId: string) => string;
  variant?: ChatSkinVariant;
}

export const ReactionBar: React.FC<ReactionBarProps> = ({ reactions, onToggle, isMine, getReactorName, variant }) => {
  if (reactions.length === 0) return null;
  const hb = variant === "hb";

  return (
    <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? "justify-end" : "justify-start"}`}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onToggle(r.emoji)}
          title={r.reactorUserIds.length > 0 && getReactorName
            ? r.reactorUserIds.map(id => getReactorName(id)).filter(Boolean).join(", ")
            : undefined
          }
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-colors border ${
            r.reacted
              ? hb
                ? "bg-hb-evergreen/10 border-hb-evergreen/30 text-hb-ink"
                : "bg-primary/10 border-primary/30 text-foreground"
              : hb
                ? "bg-hb-surface border-hb-line hover:bg-hb-sage/20 text-hb-ink-soft"
                : "bg-secondary/50 border-border hover:bg-secondary text-muted-foreground"
          }`}
        >
          <span>{r.emoji}</span>
          <span className="text-[10px] font-medium">{r.count}</span>
        </button>
      ))}
    </div>
  );
};

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  isMine: boolean;
  variant?: ChatSkinVariant;
}

export const ReactionPicker: React.FC<ReactionPickerProps> = ({ onSelect, isMine, variant }) => {
  const [open, setOpen] = useState(false);
  const hb = variant === "hb";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={
            hb
              ? "p-1 rounded-md transition-all text-hb-ink-soft opacity-0 group-hover/msg:opacity-100 hover:text-hb-evergreen hover:bg-hb-evergreen/10"
              : "p-1 rounded-md transition-all text-muted-foreground opacity-0 group-hover/msg:opacity-100 hover:text-primary hover:bg-primary/10"
          }
          title="Tilføj reaktion"
        >
          <Smile className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={isMine ? "left" : "right"}
        align="center"
        className={`w-auto p-1.5 flex gap-0.5${hb ? " theme-hjemmebane border-hb-line bg-hb-surface" : ""}`}
        sideOffset={4}
      >
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onSelect(emoji);
              setOpen(false);
            }}
            className={`p-1.5 rounded-md text-base transition-colors ${hb ? "hover:bg-hb-sage/30" : "hover:bg-secondary"}`}
          >
            {emoji}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};
