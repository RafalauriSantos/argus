import { describe, expect, it, vi } from "vitest";
import { LlmJudge, normalizeJudgeResult } from "../../src/ai/llm-judge";
import { DEFAULT_USER_PROFILE } from "../../src/domain/profile";

describe("Slice 4: Semantic LLM Judge (Cloudflare Worker -> Gemini / OpenRouter)", () => {
  it("CR-4.1: normaliza e valida o contrato do juiz corretamente", () => {
    const raw = {
      is_real_job_opportunity: true,
      cv_compatibility_score: 75,
      potential_score: 80,
      declared_level: "junior",
      operational_level: "junior_to_mid",
      mandatory_requirements: ["Java", "SQL"],
      desirable_requirements: ["Vue.js"],
      hard_barriers: [],
      matched_evidence: ["Projetos próprios com Spring Boot"],
      trainable_gaps: ["Vue.js"],
      category: "COMPATIVEL",
      reasoning: "Vaga de entrada compatível com o perfil.",
      recommendation: "APPLY_NOW",
    };

    const normalized = normalizeJudgeResult(raw);
    expect(normalized.isRealJobOpportunity).toBe(true);
    expect(normalized.score).toBe(75);
    expect(normalized.potentialScore).toBe(80);
    expect(normalized.category).toBe("COMPATIVEL");
    expect(normalized.mandatoryRequirements).toEqual(["Java", "SQL"]);
    expect(normalized.trainableGaps).toEqual(["Vue.js"]);
  });

  it("CR-4.2: executa fallback gracioso se nenhuma chave de API estiver configurada", async () => {
    const judge = new LlmJudge({
      profile: DEFAULT_USER_PROFILE,
      // sem chaves configuradas
    });

    const result = await judge.evaluate({
      title: "Desenvolvedor Java Júnior",
      company: "Empresa XPTO",
      description: "Vaga para desenvolvedor Java com Spring Boot.",
      heuristicScore: 65,
    });

    expect(result.source).toBe("heuristic_fallback");
    expect(result.score).toBe(65);
    expect(result.isRealJobOpportunity).toBe(true);
    expect(result.category).toBe("COMPATIVEL");
  });

  it("CR-4.3: consome Gemini com sucesso e retorna resultado semântico", async () => {
    const mockFetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      is_real_job_opportunity: true,
                      cv_compatibility_score: 85,
                      potential_score: 90,
                      declared_level: "junior",
                      operational_level: "junior",
                      mandatory_requirements: ["TypeScript", "Node.js"],
                      desirable_requirements: [],
                      hard_barriers: [],
                      matched_evidence: ["Experiência sólida em TypeScript"],
                      trainable_gaps: [],
                      category: "COMPATIVEL",
                      reasoning: "Excelente aderência ao perfil do candidato.",
                      recommendation: "APPLY_NOW",
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const judge = new LlmJudge({
      profile: DEFAULT_USER_PROFILE,
      geminiApiKey: "fake-gemini-key",
      fetcher: mockFetcher,
    });

    const result = await judge.evaluate({
      title: "Desenvolvedor Backend Node.js / TypeScript Júnior",
      company: "Tech Corp",
      description: "Construção de APIs resilientes com Cloudflare Workers e PostgreSQL.",
      heuristicScore: 70,
    });

    expect(mockFetcher).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("gemini");
    expect(result.score).toBe(85);
    expect(result.potentialScore).toBe(90);
    expect(result.category).toBe("COMPATIVEL");
  });

  it("CR-4.3: alterna para OpenRouter quando Gemini falhar com 429", async () => {
    const mockFetcher = vi
      .fn()
      // 1ª chamada: Gemini falha com 429
      .mockResolvedValueOnce(new Response("Rate limit exceeded", { status: 429 }))
      // 2ª chamada: OpenRouter responde 200
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    is_real_job_opportunity: true,
                    cv_compatibility_score: 72,
                    potential_score: 75,
                    declared_level: "junior",
                    operational_level: "junior_to_mid",
                    mandatory_requirements: ["Java"],
                    desirable_requirements: [],
                    hard_barriers: [],
                    matched_evidence: ["Java"],
                    trainable_gaps: [],
                    category: "COMPATIVEL",
                    reasoning: "Aprovado via fallback OpenRouter.",
                    recommendation: "APPLY_NOW",
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const judge = new LlmJudge({
      profile: DEFAULT_USER_PROFILE,
      geminiApiKey: "fake-gemini-key",
      openrouterApiKey: "fake-openrouter-key",
      fetcher: mockFetcher,
    });

    const result = await judge.evaluate({
      title: "Desenvolvedor Java Pleno (Mentoria)",
      company: "Compass UOL",
      description: "Suporte e acompanhamento de equipe.",
      heuristicScore: 65,
    });

    expect(mockFetcher).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("openrouter");
    expect(result.score).toBe(72);
  });
});
