import { describe, expect, it } from "vitest";
import { formatDailyReportMessage } from "../../src/notifications/daily-report";

describe("CR-7.3: Relatório Diário de Funil no Telegram", () => {
  it("formata relatório diário consolidado com total de analisadas, aprovadas e motivos de descarte", () => {
    const reportText = formatDailyReportMessage({
      vacanciesObserved: 5,
      rejectionsCount: 42,
      topRejectionReasons: [
        { reason: "Descartada: Vaga de nível Sênior", count: 28 },
        { reason: "Descartada: Exclusiva para PCD", count: 10 },
        { reason: "Descartada: Graduação obrigatória", count: 4 },
      ],
      dateStr: "31/10/2026",
    });

    expect(reportText).toContain("Resumo Diário do Radar Argus · 31/10/2026");
    expect(reportText).toContain("Total de Oportunidades Analisadas:</b> 47");
    expect(reportText).toContain("Vagas Aprovadas / No Radar:</b> 5");
    expect(reportText).toContain("Vagas Descartadas:</b> 42");
    expect(reportText).toContain("Descartada: Vaga de nível Sênior: <b>28</b>x");
  });
});
