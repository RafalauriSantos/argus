import { describe, expect, it } from "vitest";
import {
  extractJobDetailsFromMessage,
  formatFriendlyTelegramJobReply,
} from "../../src/notifications/telegram-friendly";

describe("Slice 11: Experiência Conversacional Amigável no Telegram", () => {
  it("CR-11.3: extrai título, empresa e ID estável a partir da mensagem com link", () => {
    const rawMessage = `https://www.geekhunter.com.br/vagas/999123?utm_source=linkedin
Desenvolvedor Backend Node.js Junior (Remoto)
Empresa: Nubank
Descrição: Atuação com Node.js, TypeScript e PostgreSQL.`;

    const details = extractJobDetailsFromMessage(
      rawMessage,
      "https://www.geekhunter.com.br/vagas/999123"
    );

    expect(details.title).toBe("Desenvolvedor Backend Node.js Junior (Remoto)");
    expect(details.organization).toBe("Nubank");
    expect(details.sourceVacancyId).toBe("geekhunter_999123");
    expect(details.description).toContain("Node.js, TypeScript e PostgreSQL");
  });

  it("CR-11.2: formata aviso amigável quando a vaga já está cadastrada no radar (anti-duplicidade)", () => {
    const reply = formatFriendlyTelegramJobReply({
      status: "ACCEPTED",
      isNew: false,
      title: "Desenvolvedor Backend Node.js Junior",
      organization: "Nubank",
      score: 90,
      canonicalUrl: "https://www.geekhunter.com.br/vagas/999123",
    });

    expect(reply).toContain("Já cadastrada no seu radar");
    expect(reply).toContain("Desenvolvedor Backend Node.js Junior");
    expect(reply).toContain("Nubank");
    expect(reply).toContain("90% match");
    expect(reply).not.toContain("heuristic_fallback");
  });

  it("CR-11.1: formata parecer enriquecido por IA com tom minimalista direto ao ponto", () => {
    const reply = formatFriendlyTelegramJobReply({
      status: "ACCEPTED",
      isNew: true,
      title: "Desenvolvedor Backend Node.js Junior",
      organization: "Nubank",
      score: 90,
      canonicalUrl: "https://www.geekhunter.com.br/vagas/999123",
      judgeResult: {
        source: "gemini",
        isRealJobOpportunity: true,
        score: 90,
        potentialScore: 95,
        declaredLevel: "junior",
        operationalLevel: "junior",
        mandatoryRequirements: ["Node.js", "TypeScript"],
        desirableRequirements: ["Kafka"],
        hardBarriers: [],
        matchedEvidence: ["Node.js", "TypeScript", "PostgreSQL"],
        trainableGaps: ["Kafka"],
        category: "COMPATIVEL",
        reasoning: "Excelente aderência técnica com foco em backend Node.js.",
        recommendation: "APPLY_NOW",
      },
    });

    expect(reply).toContain("Desenvolvedor Backend Node.js Junior");
    expect(reply).toContain("Match:</b> 90%");
    expect(reply).toContain("Pontos fortes:</b> Node.js, TypeScript, PostgreSQL");
    expect(reply).toContain("Estudar:</b> Kafka");
    expect(reply).toContain("Ver vaga no site");
    expect(reply).not.toContain("APPLY_NOW");
    expect(reply).not.toContain("heuristic_fallback");
  });

  it("CR-11.1: formata fallback gracioso e minimalista sem jargão técnico", () => {
    const reply = formatFriendlyTelegramJobReply({
      status: "ACCEPTED",
      isNew: true,
      title: "Desenvolvedor Backend Java Junior",
      organization: "Tech Corp",
      score: 80,
      canonicalUrl: "https://www.geekhunter.com.br/vagas/123",
      judgeResult: {
        source: "heuristic_fallback",
        isRealJobOpportunity: true,
        score: 80,
        potentialScore: 80,
        declaredLevel: "unknown",
        operationalLevel: "unknown",
        mandatoryRequirements: [],
        desirableRequirements: [],
        hardBarriers: [],
        matchedEvidence: [],
        trainableGaps: [],
        category: "COMPATIVEL",
        reasoning: "Score atribuído via motor heurístico por ausência ou falha temporária dos provedores de IA.",
        recommendation: "APPLY_NOW",
      },
    });

    expect(reply).toContain("Desenvolvedor Backend Java Junior");
    expect(reply).toContain("Tech Corp");
    expect(reply).toContain("Match:</b> 80%");
    expect(reply).not.toContain("heuristic_fallback");
    expect(reply).not.toContain("APPLY_NOW");
    expect(reply).not.toContain("falha temporária");
  });
});
