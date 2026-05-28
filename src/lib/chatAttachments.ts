import { supabase } from "@/integrations/supabase/client";
import type { ChatAttachment } from "@/components/ChatAttachments";

/**
 * Uploads files to the chat-attachments bucket and returns attachment metadata.
 * Path: {userId}/{timestamp}-{filename}
 */
export async function uploadChatAttachments(
  userId: string,
  files: File[]
): Promise<{ attachments: ChatAttachment[]; failedCount: number }> {
  const results: ChatAttachment[] = [];
  let failedCount = 0;

  for (const file of files) {
    const ts = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${ts}-${safeName}`;

    const { error } = await supabase.storage
      .from("chat-attachments")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      console.error(`Failed to upload ${file.name}:`, error);
      failedCount++;
      continue;
    }

    const { data: urlData } = supabase.storage
      .from("chat-attachments")
      .getPublicUrl(path);

    results.push({
      name: file.name,
      url: urlData.publicUrl,
      type: file.type,
      size: file.size,
    });
  }

  return { attachments: results, failedCount };
}

// PR 1: passthrough. PR 3 swapper denne til at kalde
// get-chat-attachment-url edge function via signed URL. Holder
// kald-signaturen stabil så render-sites ikke skal røres igen i PR 3.
export function getChatAttachmentDisplayUrl(params: {
  source: "messages" | "group_messages";
  messageId: string;
  attachmentIndex: number;
  legacyUrl: string;
}): string {
  return params.legacyUrl;
}
