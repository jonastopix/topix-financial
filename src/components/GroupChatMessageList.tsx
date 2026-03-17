import React, { useEffect, useRef } from "react";
import { format, startOfDay } from "date-fns";
import { da } from "date-fns/locale";
import DOMPurify from "dompurify";
import type { GroupMessage, SenderProfile } from "@/hooks/useGroupChat";
import { MessageAttachments } from "@/components/ChatAttachments";

function dateSeparatorLabel(date: Date): string {
  const today = startOfDay(new Date());
  const d = startOfDay(date);
  const diff = today.getTime() - d.getTime();
  if (diff === 0) return "I dag";
  if (diff === 86400000) return "I går";
  return format(d, "d. MMMM yyyy", { locale: da });
}

interface Props {
  messages: GroupMessage[];
  profiles: Map<string, SenderProfile>;
  currentUserId: string;
}

const GroupChatMessageList: React.FC<Props> = ({ messages, profiles, currentUserId }) => {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      endRef.current?.scrollIntoView({ behavior: messages.length - prevCountRef.current === 1 ? "smooth" : "auto" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  let lastDateKey = "";

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
      {messages.map((msg) => {
        const msgDate = new Date(msg.created_at);
        const dateKey = startOfDay(msgDate).toISOString();
        const showDateSep = dateKey !== lastDateKey;
        lastDateKey = dateKey;

        const isMine = msg.sender_id === currentUserId;
        const sender = profiles.get(msg.sender_id);
        const initials = sender?.full_name
          ? sender.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
          : "??";

        const attachments = msg.context_meta?.attachments;

        return (
          <React.Fragment key={msg.id}>
            {showDateSep && (
              <div className="flex items-center gap-3 py-3">
                <div className="flex-1 border-t border-border" />
                <span className="text-[11px] text-muted-foreground font-medium">
                  {dateSeparatorLabel(msgDate)}
                </span>
                <div className="flex-1 border-t border-border" />
              </div>
            )}
            <div className={`flex gap-2.5 ${isMine ? "flex-row-reverse" : ""}`}>
              {!isMine && (
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0 mt-1">
                  {sender?.avatar_url ? (
                    <img src={sender.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : initials}
                </div>
              )}
              <div className={`max-w-[75%] ${isMine ? "items-end" : "items-start"}`}>
                {!isMine && (
                  <p className="text-[11px] text-muted-foreground mb-0.5 px-1">
                    {sender?.full_name || "Ukendt"}
                  </p>
                )}
                <div
                  className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    isMine
                      ? "bg-primary text-primary-foreground rounded-tr-md"
                      : "bg-secondary text-foreground rounded-tl-md"
                  }`}
                >
                  {msg.content !== "📎" && (
                    msg.content.startsWith("<") ? (
                      <div
                        className="prose prose-sm max-w-none [&_a]:underline [&_a]:text-inherit"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.content) }}
                      />
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    )
                  )}
                  <MessageAttachments attachments={attachments} isMine={isMine} />
                </div>
                <p className={`text-[10px] text-muted-foreground mt-0.5 px-1 ${isMine ? "text-right" : ""}`}>
                  {format(msgDate, "HH:mm")}
                </p>
              </div>
            </div>
          </React.Fragment>
        );
      })}
      <div ref={endRef} />
    </div>
  );
};

export default GroupChatMessageList;
