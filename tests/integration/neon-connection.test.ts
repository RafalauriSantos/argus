import { describe, expect, it } from "vitest";
import worker from "../../src/index";
import { checkDatabaseHealth } from "../../src/storage/neon";

describe("Neon PostgreSQL Healthcheck (Slice 0)", () => {
  it("fails gracefully when DATABASE_URL is missing", async () => {
    const health = await checkDatabaseHealth("");
    expect(health.connected).toBe(false);
    expect(health.error).toContain("DATABASE_URL não configurada");
  });

  it("handles healthcheck endpoint over fetch when unconfigured", async () => {
    const request = new Request("http://localhost/health/db");
    const response = await worker.fetch(request, {}, {} as any);
    expect(response.status).toBe(503);
    const body = await response.json() as any;
    expect(body.database).toBe("unconfigured");
  });

  it("fails gracefully with invalid connection string", async () => {
    const health = await checkDatabaseHealth("postgresql://invalid:fake@127.0.0.1:5432/db");
    expect(health.connected).toBe(false);
    expect(health.error).toBeDefined();
  });
});
