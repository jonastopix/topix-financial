import React, { useState } from "react";
import { Smile } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { AggregatedReaction } from "@/hooks/useMessageReactions";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "🙏"];

interface ReactionBarProps {
  reactions: AggregatedReaction[];
  onToggle: (emoji: string) => void;
  isMine: boolean;
  getReactorName?: (userId: string) => string;
}

export const ReactionBar: React.FC<ReactionBarProps> = ({ reactions, onToggle, isMine, getReactorName }) => {
  if (reactions.length === 0) return null;

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
              ? "bg-primary/10 border-primary/30 text-foreground"
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
}

export const ReactionPicker: React.FC<ReactionPickerProps> = ({ onSelect, isMine }) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="p-1 rounded-md transition-all text-muted-foreground opacity-0 group-hover/msg:opacity-100 hover:text-primary hover:bg-primary/10"
          title="Tilføj reaktion"
        >
          <Smile className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={isMine ? "left" : "right"}
        align="center"
        className="w-auto p-1.5 flex gap-0.5"
        sideOffset={4}
      >
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onSelect(emoji);
              setOpen(false);
            }}
            className="p-1.5 rounded-md hover:bg-secondary text-base transition-colors"
          >
            {emoji}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};
