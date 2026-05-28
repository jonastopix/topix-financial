import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Mints a signed URL for a chat attachment via the get-chat-attachment-url
// edge function. The edge function gates access via RLS on the underlying
// message row, so this hook does not need to duplicate any authorization
// logic. TTL is 10 min server-side; staleTime is 9 min so TanStack Query
// refetches in the background a minute before expiration.
export function useChatAttachmentUrl(params: {
  source: "messages" | "group_messages";
  messageId: string;
  attachmentIndex: number;
}) {
  const { source, messageId, attachmentIndex } = params;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["chat-attachment-url", source, messageId, attachmentIndex],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "get-chat-attachment-url",
        { body: { source, messageId, attachmentIndex } }
      );
      if (error) throw error;
      return data as { url: string; expiresAt: string };
    },
    enabled: !!messageId,
    staleTime: 9 * 60_000,
    gcTime: 15 * 60_000,
  });

  return { url: data?.url, isLoading, isError, refetch };
}
