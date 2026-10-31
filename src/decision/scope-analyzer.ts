import type { UserProfile } from "../domain/profile";
import { DEFAULT_USER_PROFILE } from "../domain/profile";

export interface ScopeEvaluation {
  eligible: boolean;
  reasonCode:
    | "eligible"
    | "senior_blocked"
    | "pcd_exclusive_blocked"
    | "location_unsupported"
    | "mandatory_education_barrier"
    | "profile_stack_insufficient";
  declaredLevel: "entry" | "junior" | "mid" | "senior" | "unknown";
  operationalLevel: "entry" | "junior" | "junior_to_mid" | "mid" | "senior";
  isRemote: boolean;
  score: number;
  matchedStack: string[];
  cautions: string[];
  reason: string;
}

function cleanText(text: string): string {
  return (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function evaluateVacancyScope(
  title: string,
  description: string = "",
  location: string = "",
  workModel: string = "unknown",
  profile: UserProfile = DEFAULT_USER_PROFILE
): ScopeEvaluation {
  const normTitle = cleanText(title);
  const normDesc = cleanText(description);
  const normLoc = cleanText(location);
  const fullText = `${normTitle} ${normDesc} ${normLoc}`;

  // 1. Barreira: Vagas Afirmativas / Exclusivas PCD (o usuário não é PCD)
  if (
    /(?:vaga|posicao|oportunidade)?\s*(?:exclusiva|afirmativa|apenas)\s*(?:para)?\s*pcd/i.test(fullText) ||
    /exclusivo\s*(?:para)?\s*pcd/i.test(fullText)
  ) {
    return {
      eligible: false,
      reasonCode: "pcd_exclusive_blocked",
      declaredLevel: "unknown",
      operationalLevel: "junior",
      isRemote: false,
      score: 0,
      matchedStack: [],
      cautions: ["Vaga afirmativa/exclusiva para PCD"],
      reason: "Descartada: Vaga exclusiva para PCD (usuário não se enquadra)",
    };
  }

  // 2. Barreira: Ensino Superior Obrigatório (usuário está cursando tecnólogo e não tem superior completo)
  const hasDegreeBarrier =
    /(?:ensino superior completo|graduacao completa|formacao superior concluida|bachelor degree required|must have a bachelor)/i.test(normDesc) &&
    !/(?:cursando|ou em andamento|em andamento|desejavel|diferencial)/i.test(normDesc);

  if (hasDegreeBarrier) {
    return {
      eligible: false,
      reasonCode: "mandatory_education_barrier",
      declaredLevel: "unknown",
      operationalLevel: "junior",
      isRemote: false,
      score: 0,
      matchedStack: [],
      cautions: ["Exige ensino superior completo como mandatório"],
      reason: "Descartada: Exige ensino superior completo como requisito obrigatório",
    };
  }

  // 3. Localização & Modalidade (Remoto aceito globalmente; presencial apenas na região de Sorocaba/Tatuí)
  const isRemote =
    workModel.toLowerCase() === "remote" ||
    /(?:remoto|remote|home office|100% remoto|trabalho remoto)/i.test(fullText);

  if (!isRemote) {
    const matchesAcceptedCity = profile.regiaoAceitaPresencial.some((city) =>
      cleanText(normLoc).includes(cleanText(city))
    );
    if (!matchesAcceptedCity && normLoc.length > 2) {
      return {
        eligible: false,
        reasonCode: "location_unsupported",
        declaredLevel: "unknown",
        operationalLevel: "junior",
        isRemote: false,
        score: 0,
        matchedStack: [],
        cautions: [`Local presencial fora da região aceita: ${location}`],
        reason: `Descartada: Vaga presencial/híbrida fora da região atendida (${location})`,
      };
    }
  }

  // 4. Análise de Nível Declarado (Título e Descrição)
  let declaredLevel: "entry" | "junior" | "mid" | "senior" | "unknown" = "unknown";
  if (/(?:senior|sênior|\bsr\.?|\blead\b|\bstaff\b|\bprincipal\b|\bespecialista\b|\barquiteto\b|\btech lead\b|\bgerente\b|\bcoordenador\b)/i.test(normTitle)) {
    declaredLevel = "senior";
  } else if (/(?:pleno|pl)/i.test(normTitle)) {
    declaredLevel = "mid";
  } else if (/(?:junior|júnior|jr|estagio|estágio|intern|trainee|entry[- ]level|developer i|desenvolvedor i)/i.test(normTitle)) {
    declaredLevel = "junior";
  }

  // Sênior explícito no título ou na descrição é bloqueado
  const isSeniorInDesc =
    /(?:desenvolvedor|desenvolvedora|engenheiro|engenheira|programador|programadora|analista|backend|back-end|frontend|front-end|fullstack|full-stack)\s+(?:senior|sênior|\bsr\b)/i.test(normDesc) ||
    /(?:nivel|nível|senioridade|perfil)\s*[:=-]?\s*(?:senior|sênior)/i.test(normDesc) ||
    /(?:vaga|posicao|oportunidade)\s*(?:senior|sênior)/i.test(normDesc) ||
    /(?:(?:5|6|7|8|9|10)\s*(?:\+|\s*a\s*\d+)?\s*anos?\s*de\s*experiencia)/i.test(fullText);

  if (declaredLevel === "senior" || isSeniorInDesc) {
    return {
      eligible: false,
      reasonCode: "senior_blocked",
      declaredLevel: "senior",
      operationalLevel: "senior",
      isRemote,
      score: 0,
      matchedStack: [],
      cautions: ["Vaga declara nível Sênior/Lead (fora do escopo Júnior/Pleno)"],
      reason: "Descartada: Vaga de nível Sênior, fora do seu perfil (Júnior/Pleno)",
    };
  }

  // 5. Análise de Escopo Operacional (Tarefas sênior vs acompanhamento/suporte)
  const seniorTasks = [
    "liderar time", "tech lead", "arquitetura", "decisoes tecnicas",
    "5 anos", "6 anos", "7 anos", "8 anos", "lideranca", "microsservicos"
  ].filter(signal => fullText.includes(signal));

  const juniorSupportSignals = [
    "sob orientacao", "com acompanhamento", "sob supervisao", "apoio ao desenvolvimento",
    "correcoes simples", "testes basicos", "vontade de aprender", "mentoria",
    "nao esperamos que voce saiba tudo", "estamos formando o time"
  ].filter(signal => fullText.includes(signal));

  let operationalLevel: "entry" | "junior" | "junior_to_mid" | "mid" | "senior" = declaredLevel === "mid" ? "mid" : "junior";
  if (seniorTasks.length >= 2 || seniorTasks.some(s => s.includes("anos") || s === "tech lead")) {
    operationalLevel = "senior";
    return {
      eligible: false,
      reasonCode: "senior_blocked",
      declaredLevel,
      operationalLevel,
      isRemote,
      score: 10,
      matchedStack: [],
      cautions: [`Escopo operacional sênior detectado: ${seniorTasks.join(", ")}`],
      reason: "Descartada: Escopo de responsabilidades é de nível Sênior",
    };
  }

  if (juniorSupportSignals.length > 0 && declaredLevel === "mid") {
    operationalLevel = "junior_to_mid";
  }

  // 6. Match de Stack Técnica
  const allStack = [...profile.stackCore, ...profile.stackSecundaria];
  const matchedStack = allStack.filter(tech => {
    const pattern = new RegExp(`(?:^|[^a-z0-9])${cleanText(tech)}(?:$|[^a-z0-9])`, "i");
    return pattern.test(fullText);
  });

  // Cálculo de Score Heurístico
  let score = 30; // Base inicial
  if (declaredLevel === "junior") score += 25;
  if (operationalLevel === "junior_to_mid") score += 20; // Oportunidade de progressão
  if (isRemote) score += 10;

  // Pontuação por tecnologias da stack
  const coreMatched = profile.stackCore.filter(t => matchedStack.includes(t));
  const secondaryMatched = profile.stackSecundaria.filter(t => matchedStack.includes(t));
  score += coreMatched.length * 10;
  score += secondaryMatched.length * 5;

  const cautions: string[] = [];
  if (declaredLevel === "mid") {
    cautions.push("Vaga declarada como Pleno — analisar oportunidade de progressão");
  }

  return {
    eligible: true,
    reasonCode: "eligible",
    declaredLevel,
    operationalLevel,
    isRemote,
    score: Math.min(100, score),
    matchedStack,
    cautions,
    reason: `Aprovada: ${operationalLevel === 'junior_to_mid' ? 'Pleno acessível' : declaredLevel} com stack compatível (${matchedStack.join(', ')})`,
  };
}
