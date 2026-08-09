/** In-memory-simulation af handout-motorens tabeller til dybdetest af
    skrivevejene H1-H6 (budgetTargetsMock-forbilledet): de RIGTIGE unikke
    nøgler — handouts(user_id, module) og handout_lever_milestones
    (handout_id, lever_index), migration 20260224071122 — og PRÆCIS de
    query-kæder handoutEngine bruger (og kun dem). Ikke en generel
    supabase-mock: handouts + milestones + handout_lever_milestones,
    functions.invoke-stub og auth.getSession-stub (handoutNotify's gate).

    Trofasthed hvor det betyder noget:
    - insert mod unik nøgle: rammes en dublet, skrives INTET for den
      tabel, og der returneres { error: { code: "23505" } }.
    - insert(...).select("id").single() returnerer den nye rækkes id
      (motorens insert-vs-update-gren og milestone-oprettelsen). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Filter = (row: Row) => boolean;

const UNIQUE_KEYS: Record<string, ((r: Row) => string) | null> = {
  handouts: (r) => `${r.user_id}|${r.module}`,
  handout_lever_milestones: (r) => `${r.handout_id}|${r.lever_index}`,
  milestones: null,
};

const ID_PREFIX: Record<string, string> = {
  handouts: "h",
  handout_lever_milestones: "hlm",
  milestones: "ms",
};

export function createHandoutTablesMock() {
  const tables: Record<string, Row[]> = {
    handouts: [],
    handout_lever_milestones: [],
    milestones: [],
  };
  let idCounter = 0;

  const requireTable = (name: string): Row[] => {
    if (!(name in tables)) throw new Error(`handoutTablesMock: ukendt tabel ${name}`);
    return tables[name];
  };

  const makeSelect = (tableName: string) => {
    const rows = requireTable(tableName);
    const filters: Filter[] = [];
    const exec = () => rows.filter((r) => filters.every((f) => f(r))).map((r) => ({ ...r }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      eq(col: string, val: unknown) {
        filters.push((r) => String(r[col]) === String(val));
        return builder;
      },
      in(col: string, vals: unknown[]) {
        const set = new Set(vals.map(String));
        filters.push((r) => set.has(String(r[col])));
        return builder;
      },
      async maybeSingle() {
        const m = exec();
        return { data: m[0] ?? null, error: null };
      },
      async single() {
        const m = exec();
        if (m.length !== 1) return { data: null, error: { code: "PGRST116", message: `single(): ${m.length} rækker` } };
        return { data: m[0], error: null };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then(resolve: any, reject?: any) {
        return Promise.resolve({ data: exec(), error: null }).then(resolve, reject);
      },
    };
    return builder;
  };

  const makeInsert = (tableName: string, rowIn: Row | Row[]) => {
    const rows = requireTable(tableName);
    const incoming = Array.isArray(rowIn) ? rowIn : [rowIn];
    const keyFn = UNIQUE_KEYS[tableName];

    // Valideringspas FØRST (atomisk) — intet skrives ved dublet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: { data: Row[] | null; error: any };
    const dup = keyFn
      ? incoming.find((r) => rows.some((t) => keyFn(t) === keyFn(r)))
      : undefined;
    if (dup) {
      result = {
        data: null,
        error: {
          code: "23505",
          message: `duplicate key value violates unique constraint (${tableName}: ${keyFn!(dup)})`,
        },
      };
    } else {
      const written = incoming.map((r) => ({ id: `${ID_PREFIX[tableName]}-${++idCounter}`, ...r }));
      rows.push(...written);
      result = { data: written.map((r) => ({ ...r })), error: null };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertBuilder: any = {
      select(_cols?: string) {
        return {
          async single() {
            if (result.error) return { data: null, error: result.error };
            return { data: { ...result.data![0] }, error: null };
          },
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then(resolve: any, reject?: any) {
        return Promise.resolve({ error: result.error }).then(resolve, reject);
      },
    };
    return insertBuilder;
  };

  const makeUpdate = (tableName: string, patch: Row) => {
    const rows = requireTable(tableName);
    const filters: Filter[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      eq(col: string, val: unknown) {
        filters.push((r) => String(r[col]) === String(val));
        return builder;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then(resolve: any, reject?: any) {
        for (const r of rows) {
          if (filters.every((f) => f(r))) Object.assign(r, patch);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return builder;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invokeCalls: { name: string; body: any }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invokeHandlers: Record<string, (body: any) => { data?: any; error?: any }> = {};

  const supabase = {
    from(tableName: string) {
      return {
        select: (_cols?: string) => makeSelect(tableName),
        insert: (rows: Row | Row[]) => makeInsert(tableName, rows),
        update: (patch: Row) => makeUpdate(tableName, patch),
      };
    },
    functions: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invoke: async (name: string, opts?: { body?: any }) => {
        invokeCalls.push({ name, body: opts?.body });
        const handler = invokeHandlers[name];
        if (!handler) return { data: null, error: null };
        return handler(opts?.body);
      },
    },
    auth: {
      // handoutNotify gater på en session m. access_token før invoke.
      getSession: async () => ({ data: { session: { access_token: "test-token" } } }),
    },
  };

  return {
    supabase,
    tables,
    invokeCalls,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setInvokeHandler(name: string, handler: (body: any) => { data?: any; error?: any }) {
      invokeHandlers[name] = handler;
    },
    seed(tableName: string, rows: Row[]) {
      const t = requireTable(tableName);
      for (const r of rows) t.push({ id: `${ID_PREFIX[tableName]}-${++idCounter}`, ...r });
    },
  };
}

export type HandoutTablesMock = ReturnType<typeof createHandoutTablesMock>;
