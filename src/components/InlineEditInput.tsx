import React, { useRef, useEffect } from "react";
import { Check, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

const InlineEditInput: React.FC<Props> = ({ value, onChange, onSave, onCancel }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(value.length, value.length);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="w-full">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full min-h-[40px] max-h-[300px] px-3 py-2 rounded-xl text-sm bg-background border border-primary/30 text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
        rows={Math.min(12, value.split("\n").length || 1)}
      />
      <div className="flex items-center gap-1 mt-1">
        <button
          onClick={onSave}
          className="p-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          title="Gem (Enter)"
        >
          <Check className="h-3 w-3" />
        </button>
        <button
          onClick={onCancel}
          className="p-1 rounded-md bg-secondary text-muted-foreground hover:bg-secondary/80 transition-colors"
          title="Annuller (Esc)"
        >
          <X className="h-3 w-3" />
        </button>
        <span className="text-[9px] text-muted-foreground ml-1">Enter = gem · Esc = annuller</span>
      </div>
    </div>
  );
};

export default InlineEditInput;
