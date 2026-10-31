export interface VacancyEvidenceInput {
  title: string;
  organization?: string | null;
  location?: string | null;
  workModel?: string;
  description?: string | null;
}

export interface VacancyEvidenceResult {
  level: "LOW_EVIDENCE" | "MEDIUM_EVIDENCE" | "HIGH_EVIDENCE";
  score: number;
  signals: string[];
}

export function profileVacancyEvidence(input: VacancyEvidenceInput): VacancyEvidenceResult {
  const desc = (input.description || "").trim();
  const descLen = desc.length;

  let score = 0;
  const signals: string[] = [];

  // 1. Densidade da Descrição (até 50 pontos)
  if (descLen >= 500) {
    score += 50;
    signals.push("Descrição longa e detalhada (>= 500 chars)");
  } else if (descLen >= 200) {
    score += 30;
    signals.push("Descrição média (200-499 chars)");
  } else if (descLen > 0) {
    score += 10;
    signals.push("Descrição curta (< 200 chars)");
  } else {
    signals.push("Descrição ausente");
  }

  // 2. Qualidade do Título (até 20 pontos)
  const titleWords = (input.title || "").trim().split(/\s+/).filter(Boolean).length;
  if (titleWords >= 3) {
    score += 20;
    signals.push("Título bem estruturado");
  } else if (titleWords >= 1) {
    score += 10;
  }

  // 3. Modalidade e Localização (até 20 pontos)
  if (input.workModel && input.workModel !== "unknown") {
    score += 10;
    signals.push(`Modalidade explícita: ${input.workModel}`);
  }
  if (input.location && input.location.trim().length > 0) {
    score += 10;
    signals.push(`Localidade informada: ${input.location}`);
  }

  // 4. Empresa Identificada (10 pontos)
  if (input.organization && !["rss", "unknown", ""].includes(input.organization.toLowerCase().trim())) {
    score += 10;
    signals.push(`Empresa identificada: ${input.organization}`);
  }

  let level: VacancyEvidenceResult["level"] = "LOW_EVIDENCE";
  if (score >= 60) {
    level = "HIGH_EVIDENCE";
  } else if (score >= 35) {
    level = "MEDIUM_EVIDENCE";
  }

  return { level, score, signals };
}
