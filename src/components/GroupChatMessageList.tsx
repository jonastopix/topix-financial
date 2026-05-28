import React, { useEffect, useRef, useMemo } from "react";
import { format, startOfDay } from "date-fns";
import { da } from "date-fns/locale";
import DOMPurify from "dompurify";
import type { GroupMessage, SenderProfile } from "@/hooks/useGroupChat";
import { MessageAttachments } from "@/components/ChatAttachments";
import { useMessageReactions } from "@/hooks/useMessageReactions";
import { ReactionBar, ReactionPicker } from "@/components/MessageReactions";
import { useMessageActions } from "@/hooks/useMessageActions";
import { useConversationLastSeen } from "@/hooks/useConversationLastSeen";
import MessageActionMenu from "@/components/MessageActionMenu";
import InlineEditInput from "@/components/InlineEditInput";
import MobileMessageActionDrawer from "@/components/MobileMessageActionDrawer";
import { useIsMobile } from "@/hooks/use-mobile";

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
  conversationId?: string;
  isAdvisor?: boolean;
  onMessageDeleted?: (messageId: string) => void;
  onMessageEdited?: (messageId: string, newContent: string, editedAt: string) => void;
}

const GroupChatMessageList: React.FC<Props> = ({
  messages,
  profiles,
  currentUserId,
  conversationId,
  isAdvisor = false,
  onMessageDeleted,
  onMessageEdited,
}) => {
  const isMobile = useIsMobile();
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const { getAggregated, toggleReaction } = useMessageReactions(
    messageIds,
    "group_messages",
    currentUserId
  );

  const {
    editingId, editContent, setEditContent,
    startEdit, cancelEdit, saveEdit,
    deleteMessage, canEdit, canDelete,
  } = useMessageActions("group_messages", currentUserId, isAdvisor);

  const latestMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const { lastSeenMessageId } = useConversationLastSeen(
    conversationId || null,
    "group",
    currentUserId,
    latestMessageId
  );

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      endRef.current?.scrollIntoView({ behavior: messages.length - prevCountRef.current === 1 ? "smooth" : "auto" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  const handleDelete = async (messageId: string) => {
    const ok = await deleteMessage(messageId);
    if (ok) onMessageDeleted?.(messageId);
  };

  const handleSaveEdit = async (messageId: string) => {
    const trimmed = editContent.trim();
    const ok = await saveEdit(messageId);
    if (ok) onMessageEdited?.(messageId, trimmed, new Date().toISOString());
  };

  let lastDateKey = "";
  let unreadDividerShown = false;

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
        const aggregated = getAggregated(msg.id);
        const isEditing = editingId === msg.id;

        // Unread divider: show AFTER last-seen message
        let showUnreadDivider = false;
        if (
          !unreadDividerShown &&
          lastSeenMessageId &&
          lastSeenMessageId !== latestMessageId &&
          msg.id !== lastSeenMessageId
        ) {
          // We haven't passed it yet, keep looking
        }
        // After passing lastSeenMessageId, show divider on next message that isn't ours
        if (!unreadDividerShown && lastSeenMessageId) {
          // Check if previous message was the lastSeen
          const idx = messages.indexOf(msg);
          if (idx > 0 && messages[idx - 1].id === lastSeenMessageId && !isMine) {
            showUnreadDivider = true;
            unreadDividerShown = true;
          }
        }

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
            {showUnreadDivider && (
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 border-t border-primary/50" />
                <span className="text-[11px] text-primary font-semibold px-2">
                  Nye beskeder
                </span>
                <div className="flex-1 border-t border-primary/50" />
              </div>
            )}
            <div className={`flex gap-2.5 group/msg ${isMine ? "flex-row-reverse" : ""}`}>
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
                <div className="relative">
                  {isEditing ? (
                    <InlineEditInput
                      value={editContent}
                      onChange={setEditContent}
                      onSave={() => handleSaveEdit(msg.id)}
                      onCancel={cancelEdit}
                    />
                  ) : isMobile ? (
                    <MobileMessageActionDrawer
                      canEdit={canEdit(msg.sender_id, msg.created_at)}
                      canDelete={canDelete(msg.sender_id)}
                      onEdit={() => startEdit(msg.id, msg.content)}
                      onDelete={() => handleDelete(msg.id)}
                      onReaction={(emoji) => toggleReaction(msg.id, emoji)}
                    >
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
                        <MessageAttachments attachments={attachments} isMine={isMine} messageId={msg.id} source="group_messages" />
                        {(msg as any).edited_at && (
                          <span className={`text-[9px] italic ${isMine ? "text-primary-foreground/50" : "text-muted-foreground/60"}`}>
                            (redigeret)
                          </span>
                        )}
                      </div>
                    </MobileMessageActionDrawer>
                  ) : (
                    <>
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
                        <MessageAttachments attachments={attachments} isMine={isMine} messageId={msg.id} source="group_messages" />
                        {(msg as any).edited_at && (
                          <span className={`text-[9px] italic ${isMine ? "text-primary-foreground/50" : "text-muted-foreground/60"}`}>
                            (redigeret)
                          </span>
                        )}
                      </div>
                      {/* Action buttons - desktop only */}
                      <div className={`absolute ${isMine ? "-left-14" : "-right-14"} top-1/2 -translate-y-1/2 z-10 flex gap-0.5`}>
                        <ReactionPicker
                          onSelect={(emoji) => toggleReaction(msg.id, emoji)}
                          isMine={isMine}
                        />
                        <MessageActionMenu
                          canEdit={canEdit(msg.sender_id, msg.created_at)}
                          canDelete={canDelete(msg.sender_id)}
                          onEdit={() => startEdit(msg.id, msg.content)}
                          onDelete={() => handleDelete(msg.id)}
                          isMine={isMine}
                        />
                      </div>
                    </>
                  )}
                </div>
                <ReactionBar
                  reactions={aggregated}
                  onToggle={(emoji) => toggleReaction(msg.id, emoji)}
                  isMine={isMine}
                />
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
