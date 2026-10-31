import { describe, expect, it } from "vitest";
import { PostgresStore } from "../../src/storage/postgres-store";
import { env } from "cloudflare:test";

describe("Slice 1 — PostgresStore: Deduplicação e Rejeições no Neon", () => {
  const dbUrl = (env as any).DATABASE_URL;

  it("não duplica a mesma vaga ao ser inserida duas vezes", async () => {
    if (!dbUrl) {
      console.warn("DATABASE_URL não disponível no ambiente de teste, pulando teste live do Neon.");
      return;
    }
    const store = new PostgresStore(dbUrl);
    const testFingerprint = "fp_test_" + Date.now();

    const first = await store.upsertVacancy({
      id: "vac_1_" + Date.now(),
      canonicalUrl: "https://gupy.io/vaga-teste-" + Date.now(),
      title: "Desenvolvedor Full Stack Júnior",
      organization: "Empresa Teste",
      fingerprint: testFingerprint,
      sourceId: "gupy",
      sourceVacancyId: "job_999",
      queryId: "fullstack_jr",
    });

    expect(first.inserted).toBe(true);

    // Segunda tentativa de inserção da MESMA vaga (mesmo fingerprint)
    const second = await store.upsertVacancy({
      id: "vac_2_" + Date.now(),
      canonicalUrl: "https://gupy.io/vaga-teste-" + Date.now(),
      title: "Desenvolvedor Full Stack Júnior",
      organization: "Empresa Teste",
      fingerprint: testFingerprint,
      sourceId: "gupy",
      sourceVacancyId: "job_999",
      queryId: "fullstack_jr",
    });

    // Deve atualizar e reconhecer que NÃO é uma nova vaga
    expect(second.inserted).toBe(false);
    expect(second.vacancyId).toBe(first.vacancyId);
  });

  it("incrementa contador de rejeições em vez de criar novas linhas duplicadas", async () => {
    if (!dbUrl) return;
    const store = new PostgresStore(dbUrl);
    const jobId = "job_rej_" + Date.now();

    // Rejeição ciclo 1
    await store.recordRejection({
      source: "rss",
      sourceJobId: jobId,
      title: "Vaga Antiga",
      stage: "freshness_filter",
      reason: "Anúncio fora da janela de 72 horas",
    });

    // Rejeição ciclo 2 (mesma vaga rejeitada de novo)
    await store.recordRejection({
      source: "rss",
      sourceJobId: jobId,
      title: "Vaga Antiga",
      stage: "freshness_filter",
      reason: "Anúncio fora da janela de 72 horas",
    });

    // Verifica no banco se tem apenas 1 linha com occurrences_count = 2
    const client = store["sql"];
    const [row] = await client`
      SELECT occurrences_count
      FROM haadar.candidate_rejections
      WHERE source = 'rss' AND source_job_id = ${jobId}
    `;

    expect(row).toBeDefined();
    expect(Number(row.occurrences_count)).toBe(2);
  });
});
