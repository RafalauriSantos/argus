import { describe, expect, it } from "vitest";
import { createVacancy, generateVacancyFingerprint } from "../../src/domain/vacancy";

describe("CR-1.1 & CR-1.2: Entidade Canônica de Vaga & Fingerprint (ub-mode TDD)", () => {
  it("CR-1.1: recusa criação de vaga sem URL canônica ou título", () => {
    expect(() => {
      createVacancy({
        canonicalUrl: "",
        title: "Dev Júnior",
        organization: "Empresa X",
        sourceId: "gupy",
        sourceVacancyId: "123",
      });
    }).toThrowError(/URL canônica é obrigatória/);

    expect(() => {
      createVacancy({
        canonicalUrl: "https://gupy.io/vaga",
        title: "   ",
        organization: "Empresa X",
        sourceId: "gupy",
        sourceVacancyId: "123",
      });
    }).toThrowError(/Título é obrigatório/);
  });

  it("CR-1.2: gera o mesmo fingerprint normalizado independentemente de acentos ou maiúsculas", () => {
    const fp1 = generateVacancyFingerprint("Desenvolvedor Full Stack Júnior", "Empresa ABC");
    const fp2 = generateVacancyFingerprint("desenvolvedor full stack junior", "empresa abc");
    const fp3 = generateVacancyFingerprint("Desenvolvedor Full Stack Júnior", "Outra Empresa");

    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fp3);
  });

  it("CR-1.2: suporta agregação multi-fonte na mesma entidade de vaga", () => {
    const vacancy = createVacancy({
      canonicalUrl: "https://gupy.io/vaga-1",
      title: "Desenvolvedor Java Júnior",
      organization: "Empresa Teste",
      sourceId: "gupy",
      sourceVacancyId: "gupy_001",
    });

    expect(vacancy.sources.length).toBe(1);

    // Adiciona segunda fonte da mesma vaga (ex: encontrada também no RSS/Google News)
    vacancy.addSource({
      sourceId: "rss",
      sourceVacancyId: "rss_002",
      url: "https://news.google.com/rss/vaga-1",
    });

    expect(vacancy.sources.length).toBe(2);
    expect(vacancy.sources.map(s => s.sourceId)).toEqual(["gupy", "rss"]);
  });
});
