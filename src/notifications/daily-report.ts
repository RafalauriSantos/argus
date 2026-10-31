export interface DailyReportInput {
  vacanciesObserved: number;
  rejectionsCount: number;
  topRejectionReasons: Array<{ reason: string; count: number }>;
  dateStr?: string;
}

export function formatDailyReportMessage(input: DailyReportInput): string {
  const dateHeader = input.dateStr || new Date().toLocaleDateString("pt-BR");
  const totalProcessed = input.vacanciesObserved + input.rejectionsCount;

  const lines = [
    `📊 <b>Resumo Diário do Radar Argus · ${dateHeader}</b>`,
    "",
    `🔍 <b>Total de Oportunidades Analisadas:</b> ${totalProcessed}`,
    `✅ <b>Vagas Aprovadas / No Radar:</b> ${input.vacanciesObserved}`,
    `🛑 <b>Vagas Descartadas:</b> ${input.rejectionsCount}`,
  ];

  if (input.topRejectionReasons.length > 0) {
    lines.push("", "📉 <b>Principais Motivos de Filtro:</b>");
    for (const item of input.topRejectionReasons) {
      lines.push(`• ${item.reason}: <b>${item.count}</b>x`);
    }
  }

  lines.push("", "🤖 <i>Radar 100% autônomo operando na Cloudflare + Neon.</i>");

  return lines.join("\n");
}
