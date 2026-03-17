import { supabase } from "@/integrations/supabase/client";
import type { ChatAttachment } from "@/components/ChatAttachments";

/**
 * Uploads files to the chat-attachments bucket and returns attachment metadata.
 * Path: {userId}/{timestamp}-{filename}
 */
export async function uploadChatAttachments(
  userId: string,
  files: File[]
): Promise<ChatAttachment[]> {
  const results: ChatAttachment[] = [];

  for (const file of files) {
    const ts = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${ts}-${safeName}`;

    const { error } = await supabase.storage
      .from("chat-attachments")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      console.error(`Failed to upload ${file.name}:`, error);
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

  return results;
}
