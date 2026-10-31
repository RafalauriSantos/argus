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
      `ℹ️ <b>Já cadastrada no seu radar</b>`,
      `💼 <b>${title}</b>`,
      `🏢 ${company} · ${score}% match`,
      ``,
      `🔗 <a href="${canonicalUrl}">Acessar vaga</a>`,
    ].join("\n");
  }

  // 2. Vaga aceita e recém-inserida (Minimalista)
  if (status === "ACCEPTED") {
    const lines: string[] = [
      `🎯 <b>${title}</b>`,
      `🏢 ${company} · Remoto`,
      `⭐ <b>Match:</b> ${score}%`,
      ``,
    ];

    if (judgeResult) {
      if (judgeResult.matchedEvidence && judgeResult.matchedEvidence.length > 0) {
        lines.push(`✨ <b>Pontos fortes:</b> ${judgeResult.matchedEvidence.join(", ")}`);
      }
      if (judgeResult.trainableGaps && judgeResult.trainableGaps.length > 0) {
        lines.push(`📚 <b>Estudar:</b> ${judgeResult.trainableGaps.join(", ")}`);
      }
      if (
        (judgeResult.matchedEvidence && judgeResult.matchedEvidence.length > 0) ||
        (judgeResult.trainableGaps && judgeResult.trainableGaps.length > 0)
      ) {
        lines.push(``);
      }
    }

    lines.push(`🔗 <a href="${canonicalUrl}">Ver vaga no site</a>`);
    return lines.join("\n");
  }

  // 3. Vaga filtrada/rejeitada (Minimalista - uso interno/fallback)
  return [
    `⚠️ <b>Vaga fora do perfil</b>`,
    `💼 <b>${title}</b>`,
    `🏢 ${company}`,
    `🛑 <b>Motivo:</b> ${rejectionReason || "Fora do escopo do perfil"}`,
    ``,
    `🔗 <a href="${canonicalUrl}">Conferir link</a>`,
  ].join("\n");
}
