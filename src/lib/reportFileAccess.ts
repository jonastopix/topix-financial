import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Sanitize a filename for storage: replace Danish chars, spaces, and special chars.
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/æ/g, "ae").replace(/Æ/g, "Ae")
    .replace(/ø/g, "oe").replace(/Ø/g, "Oe")
    .replace(/å/g, "aa").replace(/Å/g, "Aa")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._\-]/g, "");
}

/**
 * Check if a file_path is a legacy path that doesn't exist in storage.
 */
export function isLegacyPath(filePath: string | null): boolean {
  if (!filePath) return true;
  return filePath.startsWith("uploads/");
}

/**
 * Build a proper storage path for a report file.
 */
export function buildStoragePath(companyId: string, reportId: string, fileName: string): string {
  return `${companyId}/${reportId}/${sanitizeFileName(fileName)}`;
}

/**
 * Open a report's original file in a new browser tab.
 * Handles signed URL creation with fallback to blob download.
 * Shows user-friendly error messages for known issues.
 */
export async function openReportFile(filePath: string): Promise<void> {
  if (!filePath || isLegacyPath(filePath)) {
    toast({
      title: "Originalfil ikke tilgængelig",
      description: "Denne rapport blev uploadet før fillagring blev aktiveret. Brug 'Genupload original' for at tilknytte filen.",
      variant: "destructive",
    });
    return;
  }

  const newWindow = window.open("", "_blank");

  try {
    // Try signed URL first (no encoding - pass raw path)
    const { data, error } = await supabase.storage
      .from("financial-documents")
      .createSignedUrl(filePath, 3600);

    if (data?.signedUrl && newWindow) {
      newWindow.location.href = data.signedUrl;
      return;
    }

    // Fallback: download as blob
    console.warn("createSignedUrl failed, trying download:", error?.message);
    const { data: blob, error: dlError } = await supabase.storage
      .from("financial-documents")
      .download(filePath);

    if (blob && newWindow) {
      newWindow.location.href = URL.createObjectURL(blob);
      return;
    }

    console.error("Download also failed:", dlError);
    newWindow?.close();
    toast({
      title: "Kunne ikke åbne filen",
      description: "Filen blev ikke fundet i lageret. Prøv at genuploade den.",
      variant: "destructive",
    });
  } catch (err) {
    console.error("Unexpected error opening file:", err);
    newWindow?.close();
    toast({ title: "Der opstod en uventet fejl", variant: "destructive" });
  }
}

/**
 * Upload a file to storage for an existing report and update file_path in DB.
 * Returns the new storage path, or null on failure.
 */
export async function uploadReportFile(
  file: File,
  companyId: string,
  reportId: string
): Promise<string | null> {
  const storagePath = buildStoragePath(companyId, reportId, file.name);

  const { error } = await supabase.storage
    .from("financial-documents")
    .upload(storagePath, file, { upsert: true });

  if (error) {
    console.error("Storage upload failed:", error.message);
    return null;
  }

  // Update file_path in DB
  await supabase
    .from("financial_reports")
    .update({ file_path: storagePath } as any)
    .eq("id", reportId);

  return storagePath;
}
