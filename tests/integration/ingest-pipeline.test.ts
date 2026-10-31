import { describe, expect, it } from "vitest";
import { IngestPipeline } from "../../src/discovery/ingest-pipeline";
import { PostgresStore } from "../../src/storage/postgres-store";
import { env } from "cloudflare:test";

describe("Slice 3: Ingest Pipeline (Adapters -> Scope Analyzer -> Neon)", () => {
  const dbUrl = (env as any).DATABASE_URL;

  it("CR-3.1 & CR-3.3: processa observação aprovada, salva no Neon e enfileira no Outbox", async () => {
    if (!dbUrl) return;
    const store = new PostgresStore(dbUrl);
    const pipeline = new IngestPipeline(store);

    const uniqueSuffix = Date.now();
    const result = await pipeline.processObservation({
      sourceId: "gupy",
      sourceVacancyId: "job_pleno_" + uniqueSuffix,
      canonicalUrl: "https://compass.uol/vaga-" + uniqueSuffix,
      title: `Fullstack Developer (AEM | Vue.js | Java) | Pleno ${uniqueSuffix} (Remoto)`,
      organization: "Compass UOL",
      location: "Remoto",
      workModel: "remote",
      descriptionSummary: "Desenvolvimento com acompanhamento, mentoria. Desejável Java e Vue.",
      queryId: "java_dev",
      observedAt: new Date().toISOString(),
      fingerprint: "fp_compass_" + uniqueSuffix,
    });

    expect(result.status).toBe("ACCEPTED");
    expect(result.score).toBeGreaterThan(60);
    expect(result.outboxEnqueued).toBe(true);

    // Valida no banco real se o outbox contém o registro pendente
    const client = store["sql"];
    const [outboxRow] = await client`
      SELECT status, payload_json
      FROM haadar.notification_outbox
      WHERE idempotency_key = ${"alert:" + result.vacancyId}
    `;

    expect(outboxRow).toBeDefined();
    expect(outboxRow.status).toBe("pending");
    expect(outboxRow.payload_json.title).toContain("Compass UOL");

    // Limpeza de teste para não poluir o outbox de produção
    await client`
      DELETE FROM haadar.notification_outbox
      WHERE idempotency_key = ${"alert:" + result.vacancyId}
    `;
  });

  it("CR-3.2: processa observação rejeitada (Sênior) e grava descarte sem duplicar", async () => {
    if (!dbUrl) return;
    const store = new PostgresStore(dbUrl);
    const pipeline = new IngestPipeline(store);
    const seniorJobId = "job_sr_" + Date.now();

    const result = await pipeline.processObservation({
      sourceId: "gupy",
      sourceVacancyId: seniorJobId,
      canonicalUrl: "https://empresa.com/vaga-" + Date.now(),
      title: "Arquiteto de Software Java Sênior",
      organization: "Empresa Grande",
      location: "Remoto",
      workModel: "remote",
      descriptionSummary: "Liderança de time técnico, 7 anos de experiência.",
      queryId: "java_dev",
      observedAt: new Date().toISOString(),
      fingerprint: "fp_senior_" + Date.now(),
    });

    expect(result.status).toBe("REJECTED");
    expect(result.rejectionReason).toContain("Sênior");
    expect(result.outboxEnqueued).toBe(false);

    // Repete a mesma rejeição
    await pipeline.processObservation({
      sourceId: "gupy",
      sourceVacancyId: seniorJobId,
      canonicalUrl: "https://empresa.com/vaga-" + Date.now(),
      title: "Arquiteto de Software Java Sênior",
      organization: "Empresa Grande",
      location: "Remoto",
      workModel: "remote",
      descriptionSummary: "Liderança de time técnico, 7 anos de experiência.",
      queryId: "java_dev",
      observedAt: new Date().toISOString(),
      fingerprint: "fp_senior_" + Date.now(),
    });

    // Verifica que houve apenas 1 linha com contador 2
    const client = store["sql"];
    const [rejRow] = await client`
      SELECT occurrences_count
      FROM haadar.candidate_rejections
      WHERE source = 'gupy' AND source_job_id = ${seniorJobId}
    `;

    expect(rejRow).toBeDefined();
    expect(Number(rejRow.occurrences_count)).toBe(2);
  });
});
