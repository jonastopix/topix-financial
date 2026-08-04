/** Dryp-logik (B6 — håndhæves i app-laget, anker company_members.created_at).
    Ren, testbar logik uden IO. Fail-closed: bruger uden membership-anker og
    uden advisor-rolle ser kun udryppet indhold (drip = null). */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Item-dryp arver fra samlingen når itemet ikke sætter sin egen (B6). */
export function effectiveDrip(
  itemDrip: number | null,
  collectionDrip: number | null | undefined,
): number | null {
  return itemDrip ?? collectionDrip ?? null;
}

export interface DripContext {
  /** company_members.created_at for den aktuelle bruger — null = intet anker. */
  joinedAt: string | null;
  /** Advisors ser alt (har typisk intet membership-anker). */
  isAdvisor: boolean;
  /** Injicérbar "nu" af hensyn til test. */
  now?: Date;
}

export interface DripState {
  unlocked: boolean;
  /** Hele dage til oplåsning (≥ 1) — kun sat når låst. */
  daysUntil?: number;
}

export function dripState(drip: number | null, ctx: DripContext): DripState {
  if (ctx.isAdvisor || drip === null) return { unlocked: true };
  if (!ctx.joinedAt) return { unlocked: false, daysUntil: drip };
  const joined = new Date(ctx.joinedAt).getTime();
  if (Number.isNaN(joined)) return { unlocked: false, daysUntil: drip };
  const now = (ctx.now ?? new Date()).getTime();
  const unlocksAt = joined + drip * MS_PER_DAY;
  if (now >= unlocksAt) return { unlocked: true };
  return { unlocked: false, daysUntil: Math.max(1, Math.ceil((unlocksAt - now) / MS_PER_DAY)) };
}
