import { describe, expect, it } from "vitest";
import { formatRichJobCard, parseTelegramWebhookUpdate } from "../../src/notifications/telegram-rich";

describe("Slice 5: Telegram Rich Job Card & Webhook Inbox", () => {
  it("CR-5.1: formata card rico em HTML com evidências de stack, senioridade e link", () => {
    const card = formatRichJobCard({
      title: "Fullstack Developer (Java / Vue.js)",
      organization: "Compass UOL",
      location: "Remoto",
      workModel: "remote",
      source: "Gupy",
      url: "https://compass.uol/vagas/123",
      score: 75,
      matchedStack: ["Java", "Vue.js", "Spring Boot"],
      cautions: ["Mentoria e acompanhamento"],
      publishedAt: new Date(Date.now() - 3600 * 1000).toISOString(), // 1h atrás
    });

    expect(card).toContain("<b>Fullstack Developer (Java / Vue.js)</b>");
    expect(card).toContain("Compass UOL · Remoto");
    expect(card).toContain("Gupy");
    expect(card).toContain("Java · Vue.js · Spring Boot");
    expect(card).toContain("Aderência: Java, Vue.js, Spring Boot");
    expect(card).toContain("https://compass.uol/vagas/123");
  });

  it("CR-5.2: extrai mensagem e link de vaga a partir do payload de webhook do Telegram", () => {
    const webhookPayload = {
      update_id: 10001,
      message: {
        message_id: 42,
        chat: { id: 998877, type: "private" },
        text: "Veja essa vaga: https://boards.greenhouse.io/empresa/jobs/9876543 por favor",
      },
    };

    const parsed = parseTelegramWebhookUpdate(webhookPayload);
    expect(parsed.valid).toBe(true);
    expect(parsed.chatId).toBe("998877");
    expect(parsed.extractedUrl).toBe("https://boards.greenhouse.io/empresa/jobs/9876543");
  });

  it("CR-5.2: rejeita webhook sem link válido", () => {
    const webhookPayload = {
      update_id: 10002,
      message: {
        message_id: 43,
        chat: { id: 998877, type: "private" },
        text: "Olá bot, bom dia!",
      },
    };

    const parsed = parseTelegramWebhookUpdate(webhookPayload);
    expect(parsed.valid).toBe(false);
    expect(parsed.extractedUrl).toBeNull();
  });

  it("CR-5.3: endpoint /telegram/webhook autentica secret e responde status processed", async () => {
    const { default: worker } = await import("../../src/index");
    const fakeEnv = {
      OPERATIONS_TOKEN: "valid-secret-token",
      DATABASE_URL: undefined, // sem db para teste de rota
    };

    // 1. Rejeita com token incorreto ou cabeçalho omitido
    const unauthReq = new Request("https://haadar.internal/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "wrong-token",
      },
      body: JSON.stringify({}),
    });
    const unauthRes = await worker.fetch(unauthReq, fakeEnv as any, {} as any);
    expect(unauthRes.status).toBe(401);

    const missingHeaderReq = new Request("https://haadar.internal/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const missingHeaderRes = await worker.fetch(missingHeaderReq, fakeEnv as any, {} as any);
    expect(missingHeaderRes.status).toBe(401);

    // 2. Aceita com secret correto e payload sem url
    const validReq = new Request("https://haadar.internal/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "valid-secret-token",
      },
      body: JSON.stringify({
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 123 },
          text: "https://boards.greenhouse.io/empresa/jobs/123",
        },
      }),
    });
    const validRes = await worker.fetch(validReq, fakeEnv as any, {} as any);
    expect(validRes.status).toBe(200);
    const data = (await validRes.json()) as any;
    expect(data.status).toBe("received");
    expect(data.url).toBe("https://boards.greenhouse.io/empresa/jobs/123");

    // 3. Processa comando interativo /ajuda ou /start
    const cmdReq = new Request("https://haadar.internal/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "valid-secret-token",
      },
      body: JSON.stringify({
        update_id: 2,
        message: {
          message_id: 2,
          chat: { id: 123 },
          text: "/ajuda",
        },
      }),
    });
    const cmdRes = await worker.fetch(cmdReq, fakeEnv as any, {} as any);
    expect(cmdRes.status).toBe(200);
    const cmdData = (await cmdRes.json()) as any;
    expect(cmdData.status).toBe("command_processed");
    expect(cmdData.command).toBe("/ajuda");
    expect(cmdData.reply).toContain("Comandos disponíveis");
  });
});

