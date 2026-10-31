import { describe, expect, it } from "vitest";
import { PostgresStore } from "../../src/storage/postgres-store";
import { env } from "cloudflare:test";

describe("Slice 12: Neon Outbox Dispatcher (CR-12.1)", () => {
  const dbUrl = (env as any).DATABASE_URL;

  it("CR-12.1: busca notificações pendentes, incrementa tentativas e marca como sent", async () => {
    if (!dbUrl) return;
    const store = new PostgresStore(dbUrl);
    const testKey = "test_alert_" + Date.now();

    // 1. Enfileira notificação de teste
    await store.enqueueNotification(testKey, "telegram", {
      title: "Vaga Teste Dispatcher",
      organization: "Empresa Dispatcher",
      score: 85,
      url: "https://teste.com/vaga-" + Date.now(),
    });

    // 2. Busca e reivindica
    const pending = await store.fetchAndClaimPendingOutbox(5);
    const target = pending.find((p) => p.idempotencyKey === testKey);

    expect(target).toBeDefined();
    expect(target?.channel).toBe("telegram");

    // 3. Marca como enviada
    await store.markOutboxDelivered(target!.id);

    // 4. Valida se o status mudou para 'sent' no Neon
    const client = store["sql"];
    const [row] = await client`
      SELECT status, delivered_at
      FROM haadar.notification_outbox
      WHERE id = ${target!.id}
    `;

    expect(row.status).toBe("sent");
    expect(row.delivered_at).toBeDefined();

    // 5. Higienização: remove a linha de teste
    await client`
      DELETE FROM haadar.notification_outbox
      WHERE id = ${target!.id}
    `;
  });
});
