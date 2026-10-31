import type { JudgeEvaluationResult } from "../ai/llm-judge";

export interface ExtractedJobDetails {
  title: string;
  organization: string;
  description: string;
  sourceVacancyId: string;
}

export interface FriendlyJobReplyOptions {
  status: "ACCEPTED" | "REJECTED";
  isNew: boolean;
  title: string;
  organization?: string;
  score: number;
  canonicalUrl: string;
  rejectionReason?: string;
  judgeResult?: JudgeEvaluationResult;
}

/**
 * Extrai detalhes da vaga (título, empresa, descrição e ID estável)
 * a partir de mensagens livres enviadas junto com o link no Telegram.
 */
export function extractJobDetailsFromMessage(rawText: string, canonicalUrl: string): ExtractedJobDetails {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("http"));

  let title = "Vaga via Telegram";
  let organization = "Empresa a confirmar";
  const descLines: string[] = [];

  for (const line of lines) {
    const compMatch = line.match(/^empresa:\s*(.+)$/i);
    const titleMatch = line.match(/^título:\s*(.+)$/i) || line.match(/^cargo:\s*(.+)$/i);

    if (compMatch) {
      organization = compMatch[1].trim();
    } else if (titleMatch) {
      title = titleMatch[1].trim();
    } else if (title === "Vaga via Telegram" && !line.toLowerCase().startsWith("descri")) {
      title = line;
    } else {
      descLines.push(line.replace(/^descrição:\s*/i, ""));
    }
  }

  // Gera um ID estável a partir da URL canônica para permitir deduplicação real
  let sourceVacancyId = "manual_" + Buffer.from(canonicalUrl).toString("base64url").slice(0, 16);
  try {
    const parsed = new URL(canonicalUrl);
    if (parsed.hostname.includes("geekhunter")) {
      const match = parsed.pathname.match(/\/vagas\/([^/]+)/);
      if (match) sourceVacancyId = `geekhunter_${match[1]}`;
    } else if (parsed.hostname.includes("gupy")) {
      const match = parsed.pathname.match(/\/jobs\/([^/]+)/);
      if (match) sourceVacancyId = `gupy_${match[1]}`;
    } else if (parsed.hostname.includes("linkedin")) {
      const match = parsed.pathname.match(/\/view\/([^/]+)/);
      if (match) sourceVacancyId = `linkedin_${match[1]}`;
    }
  } catch {
    // Mantém fallback seguro
  }

  return {
    title,
    organization,
    description: descLines.join(" ") || rawText,
    sourceVacancyId,
  };
}

/**
 * Formata a resposta do Telegram em linguagem natural, encorajadora e amigável.
 * Remove termos técnicos frios como "heuristic_fallback", "APPLY_NOW" ou "Score atribuído".
 */
export function formatFriendlyTelegramJobReply(options: FriendlyJobReplyOptions): string {
  const { status, isNew, title, organization, score, canonicalUrl, rejectionReason, judgeResult } = options;
  const company = organization || "Empresa";

  // 1. Vaga já cadastrada no radar (Anti-duplicidade)
  if (status === "ACCEPTED" && !isNew) {
    return [
      `ℹ️ <b>Essa oportunidade já está registrada no seu radar!</b>`,
      ``,
      `💼 <b>${title}</b>`,
      `🏢 ${company}`,
      `⭐ Compatibilidade: <b>${score}%</b>`,
      ``,
      `🔗 <a href="${canonicalUrl}">${canonicalUrl}</a>`,
    ].join("\n");
  }

  // 2. Vaga aceita e recém-inserida
  if (status === "ACCEPTED") {
    const isAi = judgeResult && judgeResult.source !== "heuristic_fallback";

    const lines: string[] = [
      `🎯 <b>Excelente oportunidade encontrada!</b>`,
      ``,
      `💼 <b>${title}</b>`,
      `🏢 ${company} · Remoto`,
      `⭐ <b>Compatibilidade com seu perfil:</b> ${score}%`,
      ``,
    ];

    if (isAi && judgeResult) {
      lines.push(`🤖 <b>Análise do Argus (IA):</b>`);
      lines.push(`${judgeResult.reasoning}`);
      lines.push(``);

      if (judgeResult.matchedEvidence && judgeResult.matchedEvidence.length > 0) {
        lines.push(`✨ <b>Seus pontos fortes:</b> ${judgeResult.matchedEvidence.join(", ")}`);
      }
      if (judgeResult.trainableGaps && judgeResult.trainableGaps.length > 0) {
        lines.push(`📚 <b>Dica de estudo:</b> ${judgeResult.trainableGaps.join(", ")}`);
      }
      lines.push(``);
    } else {
      lines.push(`🎯 <b>Boa oportunidade para o seu perfil!</b>`);
      lines.push(`🤖 <b>Análise do Radar:</b> Vaga compatível com suas tecnologias principais e nível de experiência desejado.`);
      lines.push(``);
    }

    lines.push(`🔗 <a href="${canonicalUrl}">Acessar oportunidade no site</a>`);
    return lines.join("\n");
  }

  // 3. Vaga filtrada/rejeitada
  return [
    `⚠️ <b>Oportunidade filtrada pelo radar</b>`,
    ``,
    `💼 <b>${title}</b>`,
    `🏢 ${company}`,
    `🛑 <b>Critério:</b> ${rejectionReason || "Fora do escopo do perfil"}`,
    ``,
    `🔗 <a href="${canonicalUrl}">Conferir link da vaga</a>`,
  ].join("\n");
}
