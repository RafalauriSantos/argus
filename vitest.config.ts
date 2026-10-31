import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");

  const fs = await import("fs");
  let dbUrl = "";
  try {
    const content = fs.readFileSync("./.dev.vars", "utf-8");
    dbUrl = content.split("\n").find(l => l.startsWith("DATABASE_URL="))?.split("=", 2)[1]?.trim().replace(/^["']|["']$/g, "") || "";
  } catch {}

  return {
    plugins: [
      cloudflareTest({
        main: "./src/index.ts",
        miniflare: {
          compatibilityDate: "2026-09-30",
          d1Databases: ["DB"],
          workflows: {
            ENRICHMENT_WORKFLOW: { name: "haadar-enrichment", className: "EnrichmentWorkflow" },
          },
          bindings: { TEST_MIGRATIONS: migrations, DATABASE_URL: dbUrl },
        },
      }),
    ],
    test: {
      setupFiles: ["./tests/helpers/apply-migrations.ts"],
    },
  };
});
