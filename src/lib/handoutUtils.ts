import type { HandoutConfig } from "@/lib/handoutConfig";

/**
 * Calculate handout completion progress as a percentage (0–100).
 *
 * Follow-up fields only count toward total+filled when their parent
 * checklist item is checked. Final result is capped at 100.
 */
export function calcHandoutProgress(
  config: HandoutConfig,
  responses: Record<string, string>,
  checklist: Record<string, boolean>,
  levers: string[]
): number {
  // Build set of base question keys (textareas + numbered_list sub-keys)
  const baseQuestionKeys = new Set<string>();
  let totalFields = 0;

  for (const s of config.sections) {
    for (const q of s.questions) {
      if (q.type === "textarea") {
        baseQuestionKeys.add(q.key);
        totalFields++;
      } else if (q.type === "numbered_list") {
        const count = q.count || 2;
        for (let i = 0; i < count; i++) {
          baseQuestionKeys.add(`${q.key}_${i}`);
        }
        totalFields += count;
      }
    }
    if (s.checklist) {
      totalFields += s.checklist.length; // checklist items themselves
    }
  }
  totalFields += config.leverCount;

  // Collect active follow-up keys (only when parent checklist item is checked)
  const activeFollowUpKeys = new Set<string>();
  for (const s of config.sections) {
    for (const item of s.checklist || []) {
      if (item.hasFollowUp && checklist[item.key]) {
        const fKey = `followup_${item.key}`;
        activeFollowUpKeys.add(fKey);
        totalFields++; // add to total only when active
      }
    }
  }

  // Count filled responses — only base keys or active follow-ups
  let filled = 0;
  for (const [key, val] of Object.entries(responses)) {
    if (!val.trim()) continue;
    if (baseQuestionKeys.has(key) || activeFollowUpKeys.has(key)) filled++;
  }

  // Checked checklist items
  filled += Object.values(checklist).filter((v) => v).length;

  // Filled levers
  filled += levers.filter((v) => v.trim()).length;

  return totalFields > 0 ? Math.min(100, Math.round((filled / totalFields) * 100)) : 0;
}
