import { describe, expect, it } from "vitest";
import { evaluateVacancyScope } from "../../src/decision/scope-analyzer";
import { DEFAULT_USER_PROFILE } from "../../src/domain/profile";

describe("Slice 2 — Scope Analyzer Ported from WorkHunter", () => {
  it("aprova vaga Pleno com escopo acessível e remoto (Exemplo Compass UOL de hoje)", () => {
    const evaluation = evaluateVacancyScope(
      "Fullstack Developer (AEM | Vue.js | Java) | Pleno (Remoto)",
      "Desenvolvimento de funcionalidades com mentoria e acompanhamento da equipe. Desejável conhecimento em Java e Vue.",
      "Remoto",
      "remote",
      DEFAULT_USER_PROFILE
    );

    expect(evaluation.eligible).toBe(true);
    expect(evaluation.declaredLevel).toBe("mid");
    expect(evaluation.operationalLevel).toBe("junior_to_mid");
    expect(evaluation.matchedStack).toContain("Java");
    expect(evaluation.score).toBeGreaterThan(60);
  });

  it("bloqueia vaga com senioridade sênior explícita", () => {
    const evaluation = evaluateVacancyScope(
      "Tech Lead / Desenvolvedor Java Sênior",
      "Liderança de time, arquitetura de microsserviços, 6 anos de experiência obrigatória",
      "Remoto",
      "remote",
      DEFAULT_USER_PROFILE
    );

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasonCode).toBe("senior_blocked");
  });

  it("bloqueia vaga afirmativa ou exclusiva para PCD", () => {
    const evaluation = evaluateVacancyScope(
      "Desenvolvedor Frontend Júnior (Vaga Afirmativa PCD)",
      "Conhecimento em React e TypeScript. Exclusivo para PCD.",
      "Remoto",
      "remote",
      DEFAULT_USER_PROFILE
    );

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasonCode).toBe("pcd_exclusive_blocked");
  });

  it("bloqueia vaga com ensino superior obrigatório estrito", () => {
    const evaluation = evaluateVacancyScope(
      "Desenvolvedor Node.js Júnior",
      "Requisitos: Ensino superior completo em Ciência da Computação (obrigatório).",
      "Remoto",
      "remote",
      DEFAULT_USER_PROFILE
    );

    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasonCode).toBe("mandatory_education_barrier");
  });

  it("permite vaga presencial apenas nas cidades aceitas da região (Sorocaba/Tatuí)", () => {
    const sorocaba = evaluateVacancyScope(
      "Desenvolvedor Java Júnior",
      "Trabalho presencial em escritório.",
      "Sorocaba - SP",
      "on-site",
      DEFAULT_USER_PROFILE
    );
    expect(sorocaba.eligible).toBe(true);

    const campinas = evaluateVacancyScope(
      "Desenvolvedor Java Júnior",
      "Trabalho presencial em escritório.",
      "Campinas - SP",
      "on-site",
      DEFAULT_USER_PROFILE
    );
    expect(campinas.eligible).toBe(false);
    expect(campinas.reasonCode).toBe("location_unsupported");
  });
});
