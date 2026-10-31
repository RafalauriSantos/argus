import { describe, expect, it } from "vitest";
import { profileVacancyEvidence } from "../../src/decision/evidence";

describe("CR-7.1: Densidade de Evidência da Vaga (Evidence Profiler)", () => {
  it("classifica vaga com descrição longa, título e empresa como HIGH_EVIDENCE", () => {
    const evidence = profileVacancyEvidence({
      title: "Desenvolvedor Backend Node.js / TypeScript Júnior",
      organization: "Tech Corp",
      location: "Remoto",
      workModel: "remote",
      description: "A".repeat(600), // > 500 caracteres
    });

    expect(evidence.level).toBe("HIGH_EVIDENCE");
    expect(evidence.score).toBeGreaterThanOrEqual(60);
    expect(evidence.signals).toContain("Descrição longa e detalhada (>= 500 chars)");
  });

  it("classifica vaga rasa com menos de 200 caracteres como LOW_EVIDENCE", () => {
    const evidence = profileVacancyEvidence({
      title: "Dev",
      organization: null,
      location: null,
      workModel: "unknown",
      description: "Contrata-se dev urgente.", // < 200 caracteres
    });

    expect(evidence.level).toBe("LOW_EVIDENCE");
    expect(evidence.score).toBeLessThan(35);
  });
});
