import { PostgresStore } from "../storage/postgres-store";
import { formatDailyReportMessage } from "./daily-report";

/**
 * Normaliza o comando vindo do Telegram:
 * - Remove espaços e quebras
 * - Remove @nome_do_bot (ex: /status@haadar_bot -> /status)
 * - Converte comandos sem barra (ex: "relatório" -> "/relatorio")
 * - Retorna null se não for um comando (ex: URL ou mensagem livre)
 */
export function parseTelegramCommand(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();

  // Se contiver URL http:// ou https://, é processado pelo analisador de vaga, não é comando
  if (/https?:\/\//i.test(trimmed)) {
    return null;
  }

  const firstToken = trimmed.split(/\s+/)[0] || "";
  const cleaned = firstToken.split("@")[0].toLowerCase();

  // Remove acentos
  const normalized = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (normalized.startsWith("/")) {
    return normalized;
  }

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

  return mapPlain[normalized] || null;
}

/**
 * Formata data/hora amigável no fuso de Brasília
 */
function formatLocalTime(isoString: string | null): string {
  if (!isoString) return "horário desconhecido";
  try {
    const d = new Date(isoString);
    return d.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "horário desconhecido";
  }
}

/**
 * Formata o nome amigável da fonte
 */
function friendlySource(src: string): string {
  const map: Record<string, string> = {
    gupy: "Gupy",
    greenhouse: "Greenhouse",
    lever: "Lever",
    trampos: "Trampos",
    geekhunter: "GeekHunter",
    rss: "RSS",
    "telegram-manual": "Telegram Manual",
  };
  return map[src.toLowerCase()] || src;
}

export function buildStartHelp(): string {
  return (
    "🏛️ <b>Olá! Eu sou o Argus.</b>\n\n" +
    "O sentinela do seu radar profissional operando 24/7 na nuvem com IA.\n\n" +
    "🤖 <b>Comandos disponíveis:</b>\n" +
    "• /relatorio — Resumo consolidado do dia\n" +
    "• /status — Situação operacional do monitor\n" +
    "• /ultimas — Últimas vagas e decisões tomadas\n" +
    "• /fontes — Volume de vagas descobertas por fonte\n" +
    "• /problemas — Principais motivos de descarte hoje\n" +
    "• /ajuda — Esta lista de opções\n\n" +
    "💡 <i>Você também pode colar qualquer link de vaga (LinkedIn, Gupy, etc.) aqui para análise imediata!</i>"
  );
}

export function buildStatus(stats: {
  dbConnected: boolean;
  totalVacancies: number;
  rejections24h: number;
  lastObservedAt: string | null;
}): string {
  if (!stats.dbConnected) {
    return (
      "⚠️ <b>Argus · atenção</b>\n\n" +
      "Banco: Indisponível\n" +
      "Não foi possível consultar as tabelas no Neon Postgres no momento."
    );
  }

  return (
    "✅ <b>Argus · tudo certo</b>\n\n" +
    "• Infra: Cloudflare Workers (Edge)\n" +
    "• Banco: Neon PostgreSQL (Operacional)\n" +
    `• Vagas em radar: ${stats.totalVacancies} catalogadas\n` +
    `• Descartes (24h): ${stats.rejections24h}\n` +
    `• Última observação: ${formatLocalTime(stats.lastObservedAt)}`
  );
}

export function buildLatestDecisions(
  decisions: Array<{
    timestamp: string;
    source: string;
    title: string;
    decision: string;
    reason: string | null;
  }>
): string {
  if (!decisions.length) {
    return "🧾 <b>Últimas decisões</b>\n\nNenhuma decisão registrada recentemente.";
  }

  const lines = ["🧾 <b>Últimas decisões</b>\n"];
  for (const item of decisions) {
    const isAccepted = item.decision === "ACCEPTED";
    const statusIcon = isAccepted ? "✅" : "❌";
    const decisionLabel = isAccepted ? "Aprovada" : "Descartada";
    const time = formatLocalTime(item.timestamp);
    const src = friendlySource(item.source);

    lines.push(`${statusIcon} <b>${item.title}</b> (${src})`);
    lines.push(`   ${time} · ${decisionLabel}`);
    if (item.reason) {
      lines.push(`   <i>Motivo: ${item.reason}</i>`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function buildSourcesBreakdown(sources: Array<{ source: string; count: number }>): string {
  if (!sources.length) {
    return (
      "📡 <b>Fontes</b>\n\n" +
      "Ainda não houve coleta registrada hoje.\n" +
      "O monitor está aguardando o próximo ciclo de execução."
    );
  }

  const total = sources.reduce((acc, curr) => acc + curr.count, 0);
  const lines = [`📡 <b>Fontes · ${total} vagas hoje</b>\n`];

  for (const item of sources) {
    lines.push(`• ${friendlySource(item.source)}: ${item.count}`);
  }

  return lines.join("\n");
}

export function buildProblems(reasons: Array<{ reason: string; count: number }>): string {
  if (!reasons.length) {
    return "✅ <b>Problemas</b>\n\nNenhum problema registrado hoje.";
  }

  const lines = ["⚠️ <b>Problemas — hoje</b>\n"];
  for (const item of reasons) {
    lines.push(`• ${item.reason}: ${item.count} vez(es)`);
  }

  return lines.join("\n");
}

/**
 * Processador principal do comando interativo recebido via webhook
 */
export async function handleTelegramCommand(command: string, store: PostgresStore): Promise<string> {
  switch (command) {
    case "/start":
    case "/ajuda":
      return buildStartHelp();

    case "/status": {
      const stats = await store.getStoreStatus();
      return buildStatus(stats);
    }

    case "/relatorio": {
      const funnel = await store.getDailyFunnelStats();
      return formatDailyReportMessage(funnel);
    }

    case "/ultimas": {
      const latest = await store.getLatestDecisions(5);
      return buildLatestDecisions(latest);
    }

    case "/fontes": {
      const breakdown = await store.getSourceBreakdown();
      return buildSourcesBreakdown(breakdown);
    }

    case "/problemas": {
      const funnel = await store.getDailyFunnelStats();
      return buildProblems(funnel.topRejectionReasons);
    }

    default:
      return "🤖 Não reconheci esse comando. Envie /ajuda para ver as opções.";
  }
}
