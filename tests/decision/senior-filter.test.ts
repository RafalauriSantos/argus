import { describe, expect, it } from "vitest";
import { evaluateVacancyScope } from "../../src/decision/scope-analyzer";
import { DEFAULT_USER_PROFILE } from "../../src/domain/profile";

describe("Senior Level Filtering & Protection", () => {
  it("rejeita vaga com 'Sênior' explícito no título", () => {
    const result = evaluateVacancyScope(
      "Desenvolvedor Backend Sênior",
      "Atuação com Node.js e TypeScript.",
      "Remoto",
      "remote",
      DEFAULT_USER_PROFILE,
    );

    expect(result.eligible).toBe(false);
    expect(result.reasonCode).toBe("senior_blocked");
    expect(result.reason).toContain("Sênior");
  });

  it("rejeita vaga cujo título é neutro ('Desenvolvedor Node.js') mas a descrição declara Sênior", () => {
    const result = evaluateVacancyScope(
      "Desenvolvedor Node.js em NTT DATA",
      "Sobre a vaga: Estamos em busca de um(a) Desenvolvedor(a) Backend Sênior Node.js para atuar no desenvolvimento...",
      "Remoto",
      "remote",
      DEFAULT_USER_PROFILE,
    );

    expect(result.eligible).toBe(false);
    expect(result.reasonCode).toBe("senior_blocked");
    expect(result.reason).toContain("Sênior");
  });

  it("rejeita vaga que exige 5+ anos de experiência na descrição", () => {
    const result = evaluateVacancyScope(
      "Engenheiro de Software TypeScript",
      "Requisitos: Necessário ter pelo menos 5 anos de experiencia com microsserviços.",
      "Remoto",
      "remote",
      DEFAULT_USER_PROFILE,
    );

    expect(result.eligible).toBe(false);
    expect(result.reasonCode).toBe("senior_blocked");
  });

  it("aprova vaga de nível Júnior ou Pleno com Node.js e TypeScript", () => {
    const result = evaluateVacancyScope(
      "Desenvolvedor Node.js Júnior",
      "Atuação no desenvolvimento de APIs com TypeScript, PostgreSQL e Docker sob orientação da equipe.",
      "Remoto",
      "remote",
      DEFAULT_USER_PROFILE,
    );

    expect(result.eligible).toBe(true);
    expect(result.reasonCode).toBe("eligible");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });
});
