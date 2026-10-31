import { describe, expect, it } from "vitest";
import { GeekHunterAdapter } from "../../src/adapters/geekhunter";
import type { QueryDefinition } from "../../src/domain/types";

describe("Slice 9: GeekHunter Adapter", () => {
  const mockQueries: QueryDefinition[] = [
    {
      id: "backend-role",
      revision: "v1",
      family: "ROLE",
      terms: ["backend", "java", "node"],
      exclusions: ["senior", "lead"],
      priority: 1,
      estimatedCost: 1,
      active: true,
    },
  ];

  it("CR-9.4: extrai vagas no padrão moderno /pt/:company/jobs/:slug com URL canônica pública", async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="job-card">
            <a href="https://www.geekhunter.com/pt/ntt-data/jobs/desenvolvedor-node-js-43">Desenvolvedor Node.js Pleno</a>
            <span class="location">Remoto</span>
          </div>
          <div class="job-card">
            <a href="/pt/tech-corp/jobs/backend-java-junior-1">Desenvolvedor Backend Java</a>
            <span class="company">Tech Corp BR</span>
            <span class="location">São Paulo, SP</span>
          </div>
        </body>
      </html>
    `;

    const mockFetcher: typeof fetch = async () => {
      return new Response(mockHtml, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    };

    const adapter = new GeekHunterAdapter(
      {
        id: "geekhunter",
        kind: "geekhunter",
        applicableQueryFamilies: ["ROLE", "STACK"],
        limits: { timeoutMs: 5000, maxRecords: 10, maxResponseBytes: 1000000 },
        allowedHosts: ["www.geekhunter.com", "geekhunter.com"],
      },
      mockQueries,
      () => new Date("2026-10-31T12:00:00Z"),
      mockFetcher,
    );

    const result = await adapter.discover({
      id: "task-1",
      roundId: "round-1",
      queryId: "backend-role",
      adapterId: "geekhunter",
      idempotencyKey: "key-1",
      attempt: 0,
    });

    expect(result.sourceId).toBe("geekhunter");
    expect(result.diagnostics).toEqual([]);
    expect(result.observations).toHaveLength(2);

    expect(result.observations[0]).toMatchObject({
      sourceId: "geekhunter",
      sourceVacancyId: "ntt-data/desenvolvedor-node-js-43",
      canonicalUrl: "https://www.geekhunter.com/pt/ntt-data/jobs/desenvolvedor-node-js-43",
      title: "Desenvolvedor Node.js Pleno",
      organization: "Ntt Data",
      workModel: "remote",
    });

    expect(result.observations[1]).toMatchObject({
      sourceId: "geekhunter",
      sourceVacancyId: "tech-corp/backend-java-junior-1",
      canonicalUrl: "https://www.geekhunter.com/pt/tech-corp/jobs/backend-java-junior-1",
      title: "Desenvolvedor Backend Java",
      organization: "Tech Corp BR",
    });
  });

  it("CR-9.4: extrai vagas a partir da listagem pública do GeekHunter (formato legado)", async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="job-card">
            <a href="https://www.geekhunter.com.br/vagas/12345">Desenvolvedor Java Junior</a>
            <span class="company">Tech Corp</span>
            <span class="location">Remoto</span>
          </div>
          <div class="job-card">
            <a href="/vagas/67890">Engenheiro de Software Node.js Pleno</a>
            <span class="company">Inovação S/A</span>
            <span class="location">São Paulo, SP</span>
          </div>
        </body>
      </html>
    `;

    const mockFetcher: typeof fetch = async () => {
      return new Response(mockHtml, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    };

    const adapter = new GeekHunterAdapter(
      {
        id: "geekhunter",
        kind: "geekhunter",
        applicableQueryFamilies: ["ROLE", "STACK"],
        limits: { timeoutMs: 5000, maxRecords: 10, maxResponseBytes: 1000000 },
        allowedHosts: ["www.geekhunter.com.br", "geekhunter.com.br"],
      },
      mockQueries,
      () => new Date("2026-10-31T12:00:00Z"),
      mockFetcher,
    );

    const result = await adapter.discover({
      id: "task-1",
      roundId: "round-1",
      queryId: "backend-role",
      adapterId: "geekhunter",
      idempotencyKey: "key-1",
      attempt: 0,
    });

    expect(result.sourceId).toBe("geekhunter");
    expect(result.diagnostics).toEqual([]);
    expect(result.observations).toHaveLength(2);

    expect(result.observations[0]).toMatchObject({
      sourceId: "geekhunter",
      sourceVacancyId: "12345",
      canonicalUrl: "https://www.geekhunter.com.br/vagas/12345",
      title: "Desenvolvedor Java Junior",
      organization: "Tech Corp",
      workModel: "remote",
    });

    expect(result.observations[1]).toMatchObject({
      sourceId: "geekhunter",
      sourceVacancyId: "67890",
      canonicalUrl: "https://www.geekhunter.com.br/vagas/67890",
      title: "Engenheiro de Software Node.js Pleno",
      organization: "Inovação S/A",
    });
  });

  it("CR-9.4: lida com falha de rede/HTTP retornando diagnóstico tipado sem crash", async () => {
    const mockFetcher: typeof fetch = async () => {
      return new Response("Internal Server Error", { status: 500 });
    };

    const adapter = new GeekHunterAdapter(
      {
        id: "geekhunter",
        kind: "geekhunter",
        applicableQueryFamilies: ["ROLE"],
        limits: { timeoutMs: 5000, maxRecords: 10, maxResponseBytes: 1000000 },
        allowedHosts: ["www.geekhunter.com.br", "geekhunter.com.br"],
      },
      mockQueries,
      () => new Date(),
      mockFetcher,
    );

    const result = await adapter.discover({
      id: "task-2",
      roundId: "round-1",
      queryId: "backend-role",
      adapterId: "geekhunter",
      idempotencyKey: "key-2",
      attempt: 0,
    });

    expect(result.observations).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].httpStatus).toBe(500);
  });
});
