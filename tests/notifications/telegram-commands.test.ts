import { describe, expect, it } from "vitest";
import {
  parseTelegramCommand,
  buildStartHelp,
  buildStatus,
  buildLatestDecisions,
  buildSourcesBreakdown,
  buildProblems,
  handleTelegramCommand,
} from "../../src/notifications/telegram-commands";

describe("Slice 8 — Telegram Interactive Commands", () => {
  describe("parseTelegramCommand", () => {
    it("identifica comandos simples com barra", () => {
      expect(parseTelegramCommand("/start")).toBe("/start");
      expect(parseTelegramCommand("/relatorio")).toBe("/relatorio");
      expect(parseTelegramCommand("/STATUS")).toBe("/status");
      expect(parseTelegramCommand("/ajuda")).toBe("/ajuda");
    });

    it("remove @botname de comandos de grupo", () => {
      expect(parseTelegramCommand("/relatorio@haadar_bot")).toBe("/relatorio");
      expect(parseTelegramCommand("/status@MyBot")).toBe("/status");
    });

    it("normaliza comandos sem barra e com acentuação", () => {
      expect(parseTelegramCommand("relatório")).toBe("/relatorio");
      expect(parseTelegramCommand("últimas")).toBe("/ultimas");
      expect(parseTelegramCommand("ajuda")).toBe("/ajuda");
    });

    it("retorna null se a mensagem for uma URL ou texto comum", () => {
      expect(parseTelegramCommand("https://gupy.io/job/123")).toBeNull();
      expect(parseTelegramCommand("Olhe essa vaga https://linkedin.com/jobs/view/99")).toBeNull();
      expect(parseTelegramCommand("Olá tudo bem?")).toBeNull();
    });

    it("retorna comando desconhecido formatado se começar com barra mas não mapeado", () => {
      expect(parseTelegramCommand("/xpto")).toBe("/xpto");
    });
  });

  describe("buildStartHelp", () => {
    it("gera mensagem com saudação e lista de comandos válidos em HTML do Telegram", () => {
      const msg = buildStartHelp();
      expect(msg).toContain("Argus");
      expect(msg).toContain("/relatorio");
      expect(msg).toContain("/status");
      expect(msg).toContain("/ultimas");
      expect(msg).toContain("/fontes");
      expect(msg).toContain("/problemas");
      expect(msg).toContain("/ajuda");
    });
  });

  describe("buildStatus", () => {
    it("formata status de saúde operacional quando o banco está saudável", () => {
      const msg = buildStatus({
        dbConnected: true,
        totalVacancies: 42,
        rejections24h: 15,
        lastObservedAt: "2026-10-31T01:00:00.000Z",
      });

      expect(msg).toContain("✅ <b>Argus · tudo certo</b>");
      expect(msg).toContain("Banco: Neon PostgreSQL (Operacional)");
      expect(msg).toContain("42");
    });

    it("alerta quando o banco estiver desconectado", () => {
      const msg = buildStatus({
        dbConnected: false,
        totalVacancies: 0,
        rejections24h: 0,
        lastObservedAt: null,
      });

      expect(msg).toContain("⚠️ <b>Argus · atenção</b>");
      expect(msg).toContain("Banco: Indisponível");
    });
  });

  describe("buildLatestDecisions", () => {
    it("formata lista de últimas decisões vazia", () => {
      const msg = buildLatestDecisions([]);
      expect(msg).toContain("Nenhuma decisão registrada");
    });

    it("formata decisões recentes com horário e motivo", () => {
      const msg = buildLatestDecisions([
        {
          timestamp: "2026-10-31T00:30:00.000Z",
          source: "gupy",
          title: "Dev Python",
          decision: "DISCARDED",
          reason: "Senioridade incompatível (Tech Lead)",
        },
        {
          timestamp: "2026-10-31T00:45:00.000Z",
          source: "greenhouse",
          title: "Fullstack Node/React",
          decision: "ACCEPTED",
          reason: null,
        },
      ]);

      expect(msg).toContain("🧾 <b>Últimas decisões</b>");
      expect(msg).toContain("Gupy");
      expect(msg).toContain("Senioridade incompatível (Tech Lead)");
      expect(msg).toContain("Greenhouse");
      expect(msg).toContain("Aprovada");
    });
  });

  describe("buildSourcesBreakdown", () => {
    it("informa quando não houver coletas no dia", () => {
      const msg = buildSourcesBreakdown([]);
      expect(msg).toContain("Ainda não houve coleta registrada hoje");
    });

    it("lista fontes ordenadas por volume de vagas", () => {
      const msg = buildSourcesBreakdown([
        { source: "gupy", count: 25 },
        { source: "greenhouse", count: 10 },
        { source: "telegram-manual", count: 2 },
      ]);

      expect(msg).toContain("📡 <b>Fontes · 37 vagas hoje</b>");
      expect(msg).toContain("• Gupy: 25");
      expect(msg).toContain("• Greenhouse: 10");
      expect(msg).toContain("• Telegram Manual: 2");
    });
  });

  describe("buildProblems", () => {
    it("informa quando não houver problemas registrados", () => {
      const msg = buildProblems([]);
      expect(msg).toContain("Nenhum problema registrado hoje");
    });

    it("detalha os principais gargalos do dia", () => {
      const msg = buildProblems([
        { reason: "Perfil fora do escopo ou senioridade não compatível", count: 18 },
        { reason: "Pouca evidência pública", count: 5 },
      ]);

      expect(msg).toContain("⚠️ <b>Problemas — hoje</b>");
      expect(msg).toContain("Perfil fora do escopo");
      expect(msg).toContain("18");
    });
  });

  describe("handleTelegramCommand", () => {
    it("retorna mensagem de ajuda ao receber /start ou /ajuda", async () => {
      const res = await handleTelegramCommand("/start", {} as any);
      expect(res).toContain("Argus");
      expect(res).toContain("/ajuda");
    });

    it("responde para comando não reconhecido", async () => {
      const res = await handleTelegramCommand("/desconhecido", {} as any);
      expect(res).toContain("Não reconheci esse comando. Envie /ajuda");
    });
  });
});
