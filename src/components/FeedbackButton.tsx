import { useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageSquarePlus } from "lucide-react";
import FeedbackDialog from "./FeedbackDialog";
import { useIsMobile } from "@/hooks/use-mobile";

const FeedbackButton = () => {
  const location = useLocation();
  const isChatRoute = location.pathname.startsWith("/chat") || location.pathname.startsWith("/group-chat");
  if (isChatRoute) return null;
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed z-30 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
        style={{
          bottom: isMobile ? 20 : 24,
          right: isMobile ? 16 : 24,
          width: isMobile ? 44 : 48,
          height: isMobile ? 44 : 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label="Send feedback"
      >
        <MessageSquarePlus className="h-5 w-5" />
      </button>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
};

export default FeedbackButton;
