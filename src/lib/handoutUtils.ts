import type { HandoutConfig } from "@/lib/handoutConfig";

/**
 * Calculate handout completion progress as a percentage (0–100).
 */
export function calcHandoutProgress(
  config: HandoutConfig,
  responses: Record<string, string>,
  checklist: Record<string, boolean>,
  levers: string[]
): number {
  const totalFields = config.sections.reduce((sum, s) => {
    let count = s.questions.filter(q => q.type === "textarea").length;
    if (s.checklist) count += s.checklist.length;
    count += s.questions.filter(q => q.type === "numbered_list").reduce((a, q) => a + (q.count || 2), 0);
    return sum + count;
  }, 0) + config.leverCount;

  const filled = Object.values(responses).filter(v => v.trim()).length
    + Object.values(checklist).filter(v => v).length
    + levers.filter(v => v.trim()).length;

  return totalFields > 0 ? Math.round((filled / totalFields) * 100) : 0;
}
