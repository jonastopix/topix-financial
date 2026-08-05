/** In-memory-simulation af budget_targets til dybdetest af motorens
    skriveveje (hb-ai-merge-recon §d): den RIGTIGE unikke nøgle
    (company_id, user_id, category, period — 20260225232158),
    delete-før-insert-semantikken, upsert m. onConflict og PRÆCIS de
    query-kæder budgetEngine bruger (og kun dem). Ikke en generel
    supabase-mock — kun budget_targets + functions.invoke-stub.

    Trofasthed mod Postgres/PostgREST hvor det betyder noget:
    - insert er atomisk: rammes ÉN dublet, skrives INTET, og der
      returneres { error: { code: "23505" } }.
    - upsert m. onConflict opdaterer budget_amount på eksisterende række;
      batch-intern dublet afvises som PostgREST ("cannot affect row a
      second time", code 21000) — det er præcis adfærden, W5's
      klientside-dedup eksisterer for at undgå.
    - or-strengen parses snævert som komma-adskilte
      "kolonne.like.<mønster>"-led (W5-formen); like bruger %-wildcard. */

export interface MockBudgetRow {
  id: string;
  user_id: string;
  company_id: string;
  category: string;
  budget_amount: number;
  period: string;
}

export type MockBudgetRowInput = Omit<MockBudgetRow, "id">;

type Filter = (row: MockBudgetRow) => boolean;

const likeToRegex = (pattern: string) =>
  new RegExp(
    `^${pattern
      .split("%")
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  );

const UNIQUE_CONFLICT = "company_id,user_id,category,period";

const uniqueKey = (r: MockBudgetRowInput) =>
  `${r.company_id}|${r.user_id}|${r.category}|${r.period}`;

export function createBudgetTargetsMock() {
  const table: MockBudgetRow[] = [];
  let idCounter = 0;
  const nextId = () => `row-${++idCounter}`;

  const makeBuilder = (op: "select" | "delete") => {
    const filters: Filter[] = [];
    const exec = () => {
      const matching = table.filter((row) => filters.every((f) => f(row)));
      if (op === "delete") {
        for (const row of matching) {
          const idx = table.indexOf(row);
          if (idx >= 0) table.splice(idx, 1);
        }
        return { data: null, error: null };
      }
      // Kolonne-udvalget ignoreres bevidst — motoren læser kun felter,
      // rækkerne faktisk har.
      return { data: matching.map((r) => ({ ...r })), error: null };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      eq(col: keyof MockBudgetRow, val: string) {
        filters.push((r) => String(r[col]) === String(val));
        return builder;
      },
      like(col: keyof MockBudgetRow, pattern: string) {
        const re = likeToRegex(pattern);
        filters.push((r) => re.test(String(r[col])));
        return builder;
      },
      in(col: keyof MockBudgetRow, vals: string[]) {
        const set = new Set(vals.map(String));
        filters.push((r) => set.has(String(r[col])));
        return builder;
      },
      or(expr: string) {
        const legs = expr
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => {
            const m = p.match(/^([a-z_]+)\.like\.(.+)$/);
            if (!m) throw new Error(`budgetTargetsMock: uunderstøttet or-led: ${p}`);
            return { col: m[1] as keyof MockBudgetRow, re: likeToRegex(m[2]) };
          });
        filters.push((r) => legs.some(({ col, re }) => re.test(String(r[col]))));
        return builder;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then(resolve: any, reject?: any) {
        return Promise.resolve(exec()).then(resolve, reject);
      },
    };
    return builder;
  };

  const writeRows = (
    rowsIn: MockBudgetRowInput | MockBudgetRowInput[],
    upsertOnConflict: string | null,
  ) => {
    const incoming = Array.isArray(rowsIn) ? rowsIn : [rowsIn];

    // Valideringspas FØRST (atomisk som Postgres) — intet skrives ved fejl.
    const seenInBatch = new Set<string>();
    for (const r of incoming) {
      const key = uniqueKey(r);
      if (seenInBatch.has(key)) {
        if (upsertOnConflict === UNIQUE_CONFLICT) {
          return {
            error: {
              code: "21000",
              message: "ON CONFLICT DO UPDATE command cannot affect row a second time",
            },
          };
        }
        return {
          error: {
            code: "23505",
            message: `duplicate key value violates unique constraint "budget_targets_company_category_period_key" (${key})`,
          },
        };
      }
      seenInBatch.add(key);

      const existing = table.find((t) => uniqueKey(t) === key);
      if (existing && upsertOnConflict !== UNIQUE_CONFLICT) {
        return {
          error: {
            code: "23505",
            message: `duplicate key value violates unique constraint "budget_targets_company_category_period_key" (${key})`,
          },
        };
      }
    }

    // Anvendelsespas.
    for (const r of incoming) {
      const existing = table.find((t) => uniqueKey(t) === uniqueKey(r));
      if (existing) {
        existing.budget_amount = r.budget_amount;
      } else {
        table.push({ id: nextId(), ...r });
      }
    }
    return { error: null };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invokeHandlers: Record<string, (body: any) => { data?: any; error?: any }> = {};

  const supabase = {
    from(tableName: string) {
      if (tableName !== "budget_targets") {
        throw new Error(`budgetTargetsMock: ukendt tabel ${tableName}`);
      }
      return {
        select: (_cols?: string) => makeBuilder("select"),
        delete: () => makeBuilder("delete"),
        insert: async (rows: MockBudgetRowInput | MockBudgetRowInput[]) => writeRows(rows, null),
        upsert: async (
          rows: MockBudgetRowInput | MockBudgetRowInput[],
          opts?: { onConflict?: string },
        ) => writeRows(rows, opts?.onConflict ?? null),
      };
    },
    functions: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invoke: async (name: string, opts?: { body?: any }) => {
        const handler = invokeHandlers[name];
        if (!handler) throw new Error(`budgetTargetsMock: ingen invoke-handler for ${name}`);
        return handler(opts?.body);
      },
    },
  };

  return {
    supabase,
    table,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setInvokeHandler(name: string, handler: (body: any) => { data?: any; error?: any }) {
      invokeHandlers[name] = handler;
    },
    seed(rows: MockBudgetRowInput[]) {
      for (const r of rows) table.push({ id: nextId(), ...r });
    },
    rowsWhere(pred: (r: MockBudgetRow) => boolean) {
      return table.filter(pred).map((r) => ({ ...r }));
    },
  };
}

export type BudgetTargetsMock = ReturnType<typeof createBudgetTargetsMock>;
