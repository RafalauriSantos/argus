export interface RichJobCardInput {
  title: string;
  organization?: string | null;
  location?: string | null;
  workModel?: string;
  source?: string | null;
  url: string;
  score?: number;
  matchedStack?: string[];
  cautions?: string[];
  publishedAt?: string | null;
  category?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPublicationAge(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const published = new Date(dateStr).getTime();
    const elapsedMinutes = Math.floor((Date.now() - published) / 60000);
    if (elapsedMinutes < 0) return "";
    if (elapsedMinutes < 60) return `há ${Math.max(1, elapsedMinutes)} min`;
    const hours = Math.floor(elapsedMinutes / 60);
    if (hours < 24) return `há ${hours} h`;
    return `há ${Math.floor(hours / 24)} d`;
  } catch {
    return "";
  }
}

export function formatRichJobCard(card: RichJobCardInput): string {
  const title = escapeHtml((card.title || "Vaga sem título").trim());
  const company = escapeHtml((card.organization || "Empresa").trim());
  const workplace = card.workModel === "remote" ? "Remoto" : card.workModel === "hybrid" ? "Híbrido" : "Presencial";
  const loc = card.location && !card.location.toLowerCase().includes("remoto") ? ` · ${escapeHtml(card.location)}` : "";
  const source = escapeHtml(card.source || "Radar Argus");
  const age = formatPublicationAge(card.publishedAt);
  const metadataLine = age ? `${source} · ${age}` : source;

  const lines: string[] = [
    `<b>${title}</b>`,
    `${company} · ${workplace}${loc}`,
    metadataLine,
  ];

  if (card.matchedStack && card.matchedStack.length > 0) {
    const stackPills = card.matchedStack.slice(0, 4).map(escapeHtml).join(" · ");
    lines.push("", stackPills);
    lines.push(`Aderência: ${card.matchedStack.slice(0, 3).map(escapeHtml).join(", ")}`);
  }

  if (card.cautions && card.cautions.length > 0) {
    lines.push(`Atenção: ${card.cautions.slice(0, 2).map(escapeHtml).join("; ")}`);
  }

  lines.push("", `🔗 ${card.url}`);

  return lines.join("\n");
}

export interface ParsedTelegramWebhook {
  valid: boolean;
  chatId: string | null;
  messageId: number | null;
  extractedUrl: string | null;
  command: string | null;
  rawText: string;
}

const URL_REGEX = /https?:\/\/[^\s<>"]+/i;

export function parseTelegramWebhookUpdate(payload: unknown): ParsedTelegramWebhook {
  const data = payload as {
    message?: {
      message_id?: number;
      chat?: { id?: number | string };
      text?: string;
    };
  } | null;

  const message = data?.message;
  if (!message || message.chat?.id == null) {
    return { valid: false, chatId: null, messageId: null, extractedUrl: null, command: null, rawText: "" };
  }

  const chatId = String(message.chat.id);
  const messageId = typeof message.message_id === "number" ? message.message_id : null;
  const rawText = String(message.text || "").trim();

  const match = rawText.match(URL_REGEX);
  if (match) {
    return {
      valid: true,
      chatId,
      messageId,
      extractedUrl: match[0],
      command: null,
      rawText,
    };
  }

  // Se não tem URL, pode ser um comando interativo
  const firstToken = rawText.split(/\s+/)[0] || "";
  const cleaned = firstToken.split("@")[0].toLowerCase();
  const normalized = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  let command: string | null = null;
  if (normalized.startsWith("/")) {
    command = normalized;
  } else {
    const mapPlain: Record<string, string> = {
      start: "/start",
      ajuda: "/ajuda",
      help: "/ajuda",
      relatorio: "/relatorio",
      status: "/status",
      ultimas: "/ultimas",
      fontes: "/fontes",
      problemas: "/problemas",
    };
    command = mapPlain[normalized] || null;
  }

  return {
    valid: Boolean(command),
    chatId,
    messageId,
    extractedUrl: null,
    command,
    rawText,
  };
}

