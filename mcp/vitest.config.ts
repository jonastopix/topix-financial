import { defineConfig } from "vitest/config";

// Standalone from the repo-root vitest config: this package has its own
// node_modules (the MCP SDK lives here, not at the root), so its tests run
// under their own vitest with a Node environment. Wired into CI via a
// dedicated job in .github/workflows/test.yml — not orphaned (RECON.md §6).
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
  },
});
