import { describe, expect, it } from "vitest";
import { IngestPipeline } from "../../src/discovery/ingest-pipeline";
import { PostgresStore } from "../../src/storage/postgres-store";
import { LlmJudge } from "../../src/ai/llm-judge";
import { DEFAULT_USER_PROFILE } from "../../src/domain/profile";

describe("Slice 10: LLM Judge in Ingest Pipeline", () => {
  // Mock simples de PostgresStore para testes unitários de pipeline
  const createMockStore = () => {
    const vacancies: any[] = [];
    const rejections: any[] = [];
    const outbox: any[] = [];

    const store = {
      recordRejection: async (rej: any) => {
        rejections.push(rej);
      },
      upsertVacancy: async (vac: any) => {
        vacancies.push(vac);
        return { vacancyId: vac.id, inserted: true };
      },
      enqueueNotification: async (idempotencyKey: string, channel: string, payload: any) => {
        outbox.push({ idempotencyKey, channel, payload });
        return true;
      },
    } as unknown as PostgresStore;

    return { store, vacancies, rejections, outbox };
  };

  it("CR-10.1: executa LlmJudge em vaga aceita pelo escopo e anexa parecer da IA", async () => {
    const { store, outbox } = createMockStore();

    const mockFetcher: typeof fetch = async () => {
      const aiResponse = {
        is_real_job_opportunity: true,
        cv_compatibility_score: 85,
        potential_score: 90,
        declared_level: "junior",
        operational_level: "junior",
        mandatory_requirements: ["Java", "Spring Boot"],
        desirable_requirements: ["AWS", "Docker"],
        hard_barriers: [],
        matched_evidence: ["Java", "Spring Boot", "PostgreSQL"],
        trainable_gaps: ["AWS"],
        category: "COMPATIVEL",
        reasoning: "Excelente aderência técnica com foco em backend Java e banco relacional.",
        recommendation: "APPLY_NOW",
      };

      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(aiResponse) }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const judge = new LlmJudge({
      profile: DEFAULT_USER_PROFILE,
      geminiApiKey: "fake-gemini-key",
      fetcher: mockFetcher,
    });

    const pipeline = new IngestPipeline(store, DEFAULT_USER_PROFILE, judge);

    const result = await pipeline.processObservation({
      sourceId: "geekhunter",
      sourceVacancyId: "gh-101",
      canonicalUrl: "https://www.geekhunter.com.br/vagas/101",
      title: "Desenvolvedor Backend Java Junior",
      organization: "Tech Solutions",
      location: "Remoto",
      workModel: "remote",
      descriptionSummary: "Vaga para atuar com microserviços Java, Spring Boot e bancos relacionais.",
      queryId: "java_dev",
      observedAt: new Date().toISOString(),
    });

    expect(result.status).toBe("ACCEPTED");
    expect(result.judgeResult).toBeDefined();
    expect(result.judgeResult?.source).toBe("gemini");
    expect(result.judgeResult?.category).toBe("COMPATIVEL");
    expect(result.judgeResult?.recommendation).toBe("APPLY_NOW");
    expect(result.judgeResult?.matchedEvidence).toContain("Java");
    expect(result.judgeResult?.trainableGaps).toContain("AWS");

    // Valida que o payload do Outbox incluiu a análise semântica da IA
    expect(outbox).toHaveLength(1);
    expect(outbox[0].payload.aiSummary).toBeDefined();
    expect(outbox[0].payload.aiSummary.category).toBe("COMPATIVEL");
    expect(outbox[0].payload.aiSummary.recommendation).toBe("APPLY_NOW");
  });

  it("CR-10.2: descarta vaga quando LlmJudge aponta que não é oportunidade de dev real", async () => {
    const { store, rejections } = createMockStore();

    const mockFetcher: typeof fetch = async () => {
      const aiResponse = {
        is_real_job_opportunity: false,
        cv_compatibility_score: 10,
        potential_score: 10,
        declared_level: "unknown",
        operational_level: "unknown",
        mandatory_requirements: [],
        desirable_requirements: [],
        hard_barriers: ["Notícia ou post institucional, não é vaga de emprego"],
        matched_evidence: [],
        trainable_gaps: [],
        category: "INCOMPATIVEL",
        reasoning: "Post de divulgação de bootcamp, não se trata de processo seletivo para vaga.",
        recommendation: "SKIP",
      };

      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(aiResponse) }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const judge = new LlmJudge({
      profile: DEFAULT_USER_PROFILE,
      geminiApiKey: "fake-gemini-key",
      fetcher: mockFetcher,
    });

    const pipeline = new IngestPipeline(store, DEFAULT_USER_PROFILE, judge);

    const result = await pipeline.processObservation({
      sourceId: "linkedin-guest",
      sourceVacancyId: "post-fake-99",
      canonicalUrl: "https://www.linkedin.com/jobs/view/fake-99",
      title: "Desenvolvedor Java Junior",
      organization: "Bootcamp Academy",
      location: "Remoto",
      workModel: "remote",
      descriptionSummary: "Participe da nossa semana de imersão gratuita e aprenda lógica de programação.",
      queryId: "java_dev",
      observedAt: new Date().toISOString(),
    });

    expect(result.status).toBe("REJECTED");
    expect(result.rejectionReason).toContain("Descartada pelo juiz de IA");
    expect(rejections).toHaveLength(1);
    expect(rejections[0].stage).toBe("llm_judge");
  });

  it("CR-10.3: opera normalmente com fallback heurístico quando LlmJudge não é fornecido", async () => {
    const { store } = createMockStore();
    const pipeline = new IngestPipeline(store, DEFAULT_USER_PROFILE);

    const result = await pipeline.processObservation({
      sourceId: "gupy",
      sourceVacancyId: "gupy-88",
      canonicalUrl: "https://empresa.gupy.io/jobs/88",
      title: "Desenvolvedor Node.js Junior",
      organization: "Startup Soluções",
      location: "Remoto",
      workModel: "remote",
      descriptionSummary: "Atuação com Node.js, Express e PostgreSQL.",
      queryId: "node_dev",
      observedAt: new Date().toISOString(),
    });

    expect(result.status).toBe("ACCEPTED");
    expect(result.judgeResult).toBeUndefined();
    expect(result.outboxEnqueued).toBe(true);
  });
});
