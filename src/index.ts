import { GreenhouseAdapter } from "./adapters/greenhouse";
import { GitHubIssuesAdapter } from "./adapters/github-issues";
import { GupyAdapter } from "./adapters/gupy";
import { TramposAdapter } from "./adapters/trampos";
import { GoogleNewsRssAdapter } from "./adapters/rss";
import { LinkedInGuestAdapter } from "./adapters/linkedin-guest";
import { GeekHunterAdapter } from "./adapters/geekhunter";
import type { SourceAdapter } from "./adapters/adapter";
import type { LlmJudge } from "./ai/llm-judge";
import { consumeMessage } from "./queue/consumer";
import type { DiscoveryTaskMessage } from "./queue/messages";
import { parseMessage } from "./queue/messages";
import { admitRound } from "./discovery/round-coordinator";
import { markTaskPublished, recordOperationalEvent } from "./storage/d1";
import { pausedSourceIds } from "./storage/source-health";
import { recoverExpiredTaskPublications } from "./storage/tasks";
import { recordUsage } from "./observability/usage-ledger";
import { utcDay } from "./budget/reservations";
import { getOperationalHealth } from "./observability/health";
import { createTelegramClient } from "./notifications/telegram";
import { dispatchOne } from "./notifications/dispatcher";
import { reconcileConfirmedDeliveries } from "./notifications/reconcile";
import { runRetention } from "./maintenance/retention";
import { initialQueries } from "./portfolio/query-portfolio";
import { pilotSources } from "./portfolio/sources";
import type { SourceDefinition } from "./portfolio/sources";
import type { EnrichmentWorkflowParams } from "./workflows/enrichment";

export { EnrichmentWorkflow } from "./workflows/enrichment";

export interface Env {
  DB?: D1Database;
  DATABASE_URL?: string;
  HAADAR_DISCOVERY?: Queue<DiscoveryTaskMessage>;
  ENRICHMENT_WORKFLOW?: Workflow<EnrichmentWorkflowParams>;
  OPERATIONS_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_DESTINATION?: string;
  ADMIN_TRIGGER_TOKEN?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
}

export function createAdapters(sources: SourceDefinition[], fetcher?: typeof fetch): Record<string, SourceAdapter> {
  return Object.fromEntries(sources.map((source) => [
    source.id,
    source.adapterId === "greenhouse"
      ? new GreenhouseAdapter(source, initialQueries, undefined, fetcher)
      : source.adapterId === "github-issues"
        ? new GitHubIssuesAdapter(source, initialQueries, undefined, fetcher)
        : source.adapterId === "gupy"
          ? new GupyAdapter(source, initialQueries, undefined, fetcher)
          : source.adapterId === "trampos"
            ? new TramposAdapter(source, initialQueries, undefined, fetcher)
            : source.adapterId === "linkedin-guest"
              ? new LinkedInGuestAdapter(source, initialQueries, undefined, fetcher)
              : source.adapterId === "geekhunter"
                ? new GeekHunterAdapter(source, initialQueries, undefined, fetcher)
                : new GoogleNewsRssAdapter(source, initialQueries, undefined, fetcher),
  ]));
}

async function publishTasks(
  env: Env,
  tasks: DiscoveryTaskMessage[],
  scheduledAt: Date,
  fallbackDeliveryMode: "live" | "silent" = "live",
): Promise<void> {
  if (!env.DB || !env.HAADAR_DISCOVERY) throw new Error("D1 and Queue bindings are required for task publication");
  if (tasks.length === 0) return;
  const sourcesById = new Map(pilotSources.map((source) => [source.id, source]));
  await env.HAADAR_DISCOVERY.sendBatch(tasks.map((task) => ({
    body: { ...task, deliveryMode: task.deliveryMode ?? fallbackDeliveryMode },
    delaySeconds: sourcesById.get(task.adapterId)?.dispatchDelaySeconds,
  })));
  await Promise.all(tasks.map(async (task) => {
    if (!task.publicationLeaseToken) throw new Error("publication lease token is required");
    const marked = await markTaskPublished(env.DB!, task.id, task.publicationLeaseToken);
    if (!marked) throw new Error(`publication lease lost for task ${task.id}`);
    await recordUsage(env.DB!, `task:${task.id}:queue-publish`, utcDay(scheduledAt), "queue_operations", 1);
  }));
}

async function runDiscoveryRound(
  env: Env,
  scheduledAt: Date,
  roundSlot?: string,
  deliveryMode: "live" | "silent" = "live",
): Promise<{ roundId: string; admittedTasks: number; deliveryMode: "live" | "silent" }> {
  if (!env.DB || !env.HAADAR_DISCOVERY) throw new Error("D1 and Queue bindings are required for scheduled discovery");
  const recoveredTasks = await recoverExpiredTaskPublications(env.DB, {
    now: scheduledAt,
    leaseMs: 5 * 60_000,
  });
  const paused = await pausedSourceIds(env.DB, scheduledAt);
  const activeSources = pilotSources.filter((source) => source.active && !paused.has(source.id));
  const admission = await admitRound({
    db: env.DB,
    scheduledAt,
    roundSlot,
    portfolio: { revision: "portfolio-v2-greenhouse-pilot", queries: initialQueries },
    adapterIds: activeSources.map((source) => source.id),
    boardOnceAdapters: true,
    deliveryMode,
  });
  const tasksToPublish = [...recoveredTasks, ...admission.tasks];
  await publishTasks(env, tasksToPublish, scheduledAt, deliveryMode);
  return { roundId: admission.round.id, admittedTasks: admission.tasks.length, deliveryMode };
}

const worker = {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/health") {
      return Response.json({ service: "argus", status: "ok" });
    }
    if (pathname === "/health/db") {
      if (!env.DATABASE_URL) {
        return Response.json({ service: "argus", database: "unconfigured", error: "DATABASE_URL is not set" }, { status: 503 });
      }
      const { checkDatabaseHealth } = await import("./storage/neon");
      const health = await checkDatabaseHealth(env.DATABASE_URL);
      return Response.json({ service: "argus", database: health }, { status: health.connected ? 200 : 503 });
    }
    if (pathname === "/health/operations") {
      if (!env.DB || !env.OPERATIONS_TOKEN || request.headers.get("authorization") !== `Bearer ${env.OPERATIONS_TOKEN}`) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      return Response.json(await getOperationalHealth(env.DB));
    }
    if (pathname === "/admin/discovery" && request.method === "POST") {
      if (!env.ADMIN_TRIGGER_TOKEN || request.headers.get("authorization") !== `Bearer ${env.ADMIN_TRIGGER_TOKEN}`) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      const requestedAt = new URL(request.url).searchParams.get("scheduledAt");
      const scheduledAt = requestedAt ? new Date(requestedAt) : new Date();
      if (Number.isNaN(scheduledAt.getTime())) return Response.json({ error: "invalid_scheduled_at" }, { status: 400 });
      const notify = new URL(request.url).searchParams.get("notify") === "true";
      return Response.json(await runDiscoveryRound(
        env,
        scheduledAt,
        `manual:${scheduledAt.toISOString()}`,
        notify ? "live" : "silent",
      ), { status: 202 });
    }
    if (pathname === "/admin/dispatch" && request.method === "POST") {
      if (!env.ADMIN_TRIGGER_TOKEN || request.headers.get("authorization") !== `Bearer ${env.ADMIN_TRIGGER_TOKEN}`) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      if (!env.DB || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_DESTINATION) {
        return Response.json({ error: "delivery_not_configured" }, { status: 503 });
      }
      try {
        return Response.json({ delivery: await dispatchOne(env.DB, createTelegramClient(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_DESTINATION)) });
      } catch (error) {
        const errorName = error instanceof Error ? error.name : "UnknownError";
        console.error(JSON.stringify({ event: "admin_dispatch_failed", errorName }));
        return Response.json({ error: "dispatch_failed", errorName }, { status: 500 });
      }
    }
    if (pathname === "/admin/telegram-test" && request.method === "POST") {
      if (!env.ADMIN_TRIGGER_TOKEN || request.headers.get("authorization") !== `Bearer ${env.ADMIN_TRIGGER_TOKEN}`) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_DESTINATION) {
        return Response.json({ error: "delivery_not_configured" }, { status: 503 });
      }
      const result = await createTelegramClient(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_DESTINATION).send(
        "Argus: teste controlado do Worker para o canal de alertas.",
      );
      return Response.json({ delivery: result.kind });
    }
    if (pathname === "/admin/daily-report" && request.method === "POST") {
      if (!env.ADMIN_TRIGGER_TOKEN || request.headers.get("authorization") !== `Bearer ${env.ADMIN_TRIGGER_TOKEN}`) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      if (!env.DATABASE_URL || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_DESTINATION) {
        return Response.json({ error: "reporting_not_configured" }, { status: 503 });
      }
      const { PostgresStore } = await import("./storage/postgres-store");
      const { formatDailyReportMessage } = await import("./notifications/daily-report");
      const store = new PostgresStore(env.DATABASE_URL);
      const stats = await store.getDailyFunnelStats();
      const reportMsg = formatDailyReportMessage(stats);
      const delivery = await createTelegramClient(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_DESTINATION).send(reportMsg);
      return Response.json({ report: stats, delivery: delivery.kind });
    }
    if (pathname === "/telegram/webhook" && request.method === "POST") {
      const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
      if (env.OPERATIONS_TOKEN && secretHeader !== env.OPERATIONS_TOKEN) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      try {
        const body = await request.json();
        const { parseTelegramWebhookUpdate } = await import("./notifications/telegram-rich");
        const parsed = parseTelegramWebhookUpdate(body);
        if (!parsed.valid || !parsed.chatId) {
          return Response.json({ status: "ignored", reason: "no_valid_action" });
        }

        // 1. Tratamento de Comandos Interativos (/start, /relatorio, /status, /ultimas, etc.)
        if (parsed.command) {
          const { handleTelegramCommand } = await import("./notifications/telegram-commands");
          const { PostgresStore } = await import("./storage/postgres-store");
          const store = env.DATABASE_URL ? new PostgresStore(env.DATABASE_URL) : ({} as any);

          const replyText = await handleTelegramCommand(parsed.command, store);
          if (env.TELEGRAM_BOT_TOKEN) {
            const client = createTelegramClient(env.TELEGRAM_BOT_TOKEN, parsed.chatId);
            await client.send(replyText);
          }
          return Response.json({ status: "command_processed", command: parsed.command, reply: replyText });
        }

        // 2. Tratamento de Ingestão de Vagas por URL Manual
        if (parsed.extractedUrl) {
          if (env.DATABASE_URL) {
            const { PostgresStore } = await import("./storage/postgres-store");
            const { IngestPipeline } = await import("./discovery/ingest-pipeline");
            const { resolveShortUrl, fetchJobMetadata } = await import("./discovery/url-resolver");
            const { LlmJudge } = await import("./ai/llm-judge");
            const { DEFAULT_USER_PROFILE } = await import("./domain/profile");

            const canonicalUrl = await resolveShortUrl(parsed.extractedUrl, fetch);
            if (!canonicalUrl) {
              if (env.TELEGRAM_BOT_TOKEN) {
                const client = createTelegramClient(env.TELEGRAM_BOT_TOKEN, parsed.chatId);
                await client.send("⚠️ Link não reconhecido ou domínio não suportado pelo radar.");
              }
              return Response.json({ status: "ignored", reason: "untrusted_or_invalid_url" });
            }

            // Busca metadados reais da página da vaga (título, empresa e descrição)
            const meta = await fetchJobMetadata(canonicalUrl, fetch);

            let judge: LlmJudge | undefined;
            if (env.GEMINI_API_KEY || env.OPENROUTER_API_KEY) {
              judge = new LlmJudge({
                profile: DEFAULT_USER_PROFILE,
                geminiApiKey: env.GEMINI_API_KEY,
                openrouterApiKey: env.OPENROUTER_API_KEY,
              });
            }

            const { extractJobDetailsFromMessage, formatFriendlyTelegramJobReply } = await import("./notifications/telegram-friendly");
            const jobDetails = extractJobDetailsFromMessage(parsed.rawText, canonicalUrl);

            const finalTitle = jobDetails.title !== "Vaga via Telegram"
              ? jobDetails.title
              : (meta.title || "Vaga via Telegram");

            const finalOrg = jobDetails.organization !== "Empresa a confirmar"
              ? jobDetails.organization
              : (meta.organization || "Empresa a confirmar");

            const finalDesc = [jobDetails.description, meta.description].filter(Boolean).join(" ");

            const store = new PostgresStore(env.DATABASE_URL);
            const pipeline = new IngestPipeline(store, DEFAULT_USER_PROFILE, judge);

            const result = await pipeline.processObservation({
              sourceId: "telegram-manual",
              sourceVacancyId: jobDetails.sourceVacancyId,
              canonicalUrl,
              title: finalTitle,
              organization: finalOrg,
              location: "Remoto",
              workModel: "unknown",
              descriptionSummary: finalDesc,
              queryId: "manual_inbox",
              observedAt: new Date().toISOString(),
            });

            if (env.TELEGRAM_BOT_TOKEN) {
              const client = createTelegramClient(env.TELEGRAM_BOT_TOKEN, parsed.chatId);
              const replyMsg = formatFriendlyTelegramJobReply({
                status: result.status,
                isNew: result.inserted ?? true,
                title: finalTitle,
                organization: finalOrg,
                score: result.score ?? 70,
                canonicalUrl,
                rejectionReason: result.rejectionReason,
                judgeResult: result.judgeResult,
              });
              await client.send(replyMsg);
            }

            return Response.json({ status: "processed", result });
          }

          return Response.json({ status: "received", url: parsed.extractedUrl });
        }

        return Response.json({ status: "ignored", reason: "unrecognized" });
      } catch (err) {
        const errorName = err instanceof Error ? err.name : "UnknownError";
        return Response.json({ error: "webhook_failed", errorName }, { status: 500 });
      }
    }
    return new Response("Not found", { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const scheduledAt = new Date(controller.scheduledTime);
    if (!env.DB) throw new Error("D1 binding is required for scheduled maintenance");
    await recordOperationalEvent(env.DB, {
      eventKey: `maintenance:${scheduledAt.toISOString()}`,
      eventType: "scheduled_maintenance",
      payload: { state: "started" },
    });
    await reconcileConfirmedDeliveries(env.DB, scheduledAt);
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_DESTINATION) {
      try {
        await dispatchOne(env.DB, createTelegramClient(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_DESTINATION), scheduledAt);
      } catch (error) {
        const errorName = error instanceof Error ? error.name : "UnknownError";
        console.error(JSON.stringify({ event: "scheduled_dispatch_failed", errorName }));
      }
    }
    // Despacha notificações pendentes do Neon PostgreSQL para o Telegram
    if (env.DATABASE_URL && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_DESTINATION) {
      try {
        const { PostgresStore } = await import("./storage/postgres-store");
        const { formatFriendlyTelegramJobReply } = await import("./notifications/telegram-friendly");
        const store = new PostgresStore(env.DATABASE_URL);
        const pendingRows = await store.fetchAndClaimPendingOutbox(3);
        const client = createTelegramClient(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_DESTINATION);

        interface NotificationOutboxPayload {
          title?: string;
          organization?: string;
          score?: number;
          url?: string;
          aiSummary?: any;
        }

        for (const row of pendingRows) {
          try {
            const p = (row.payloadJson || {}) as NotificationOutboxPayload;
            const message = formatFriendlyTelegramJobReply({
              status: "ACCEPTED",
              isNew: true,
              title: p.title || "Nova oportunidade",
              organization: p.organization,
              score: p.score ?? 70,
              canonicalUrl: p.url || "",
              judgeResult: p.aiSummary,
            });
            const sent = await client.send(message);
            if (sent.kind === "sent") {
              await store.markOutboxDelivered(row.id);
            } else if (sent.kind === "failed") {
              await store.markOutboxFailed(row.id);
            }
          } catch (itemErr) {
            console.error(
              JSON.stringify({
                event: "neon_outbox_item_dispatch_failed",
                rowId: row.id,
                error: itemErr instanceof Error ? itemErr.message : String(itemErr),
              })
            );
            await store.markOutboxFailed(row.id);
          }
        }
      } catch (error) {
        const errorName = error instanceof Error ? error.name : "UnknownError";
        console.error(JSON.stringify({ event: "neon_outbox_dispatch_failed", errorName }));
      }
    }
    if (scheduledAt.getUTCHours() === 3 && scheduledAt.getUTCMinutes() === 0) {
      await runRetention(env.DB, {
        operationalEventsDays: 30,
        obsoleteObservationsDays: 14,
        batchSize: 100,
      }, { now: scheduledAt });
    }
    // Dispara relatório diário de funil às 23:00 UTC (20:00 Horário de Brasília)
    if (scheduledAt.getUTCHours() === 23 && scheduledAt.getUTCMinutes() === 0) {
      if (env.DATABASE_URL && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_DESTINATION) {
        try {
          const { PostgresStore } = await import("./storage/postgres-store");
          const { formatDailyReportMessage } = await import("./notifications/daily-report");
          const store = new PostgresStore(env.DATABASE_URL);
          const stats = await store.getDailyFunnelStats();
          const reportMsg = formatDailyReportMessage(stats);
          await createTelegramClient(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_DESTINATION).send(reportMsg);
        } catch (error) {
          const errorName = error instanceof Error ? error.name : "UnknownError";
          console.error(JSON.stringify({ event: "scheduled_daily_report_failed", errorName }));
        }
      }
    }
    if (scheduledAt.getUTCMinutes() === 0) {
      await runDiscoveryRound(env, scheduledAt);
      return;
    }
    const recoveredTasks = await recoverExpiredTaskPublications(env.DB, { now: scheduledAt, leaseMs: 5 * 60_000 });
    await publishTasks(env, recoveredTasks, scheduledAt);
  },

  async queue(batch: MessageBatch<unknown>, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (!env.DB) throw new Error("D1 binding is required for queue consumption");
    for (const message of batch.messages) {
      const parsed = parseMessage(message.body);
      if (!parsed.ok) {
        await env.DB.prepare(
          `INSERT INTO operational_events (event_key, event_type, payload_json, created_at)
           VALUES (?, 'queue_message_terminal', ?, ?)
           ON CONFLICT(event_key) DO NOTHING`,
        ).bind(
          `queue-message:${message.id}:invalid`,
          JSON.stringify({ reason: parsed.reason, attempts: message.attempts }),
          new Date().toISOString(),
        ).run();
        message.ack();
        continue;
      }
      try {
        const adapters = createAdapters(pilotSources);
        const source = pilotSources.find((item) => item.id === parsed.value.adapterId);
        let postgresStore;
        if (env.DATABASE_URL) {
          const { PostgresStore } = await import("./storage/postgres-store");
          postgresStore = new PostgresStore(env.DATABASE_URL);
        }
        const outcome = await consumeMessage({
          db: env.DB,
          task: parsed.value,
          queueAttempts: message.attempts,
          adapters,
          maxAttempts: 4,
          enrichmentWorkflow: env.ENRICHMENT_WORKFLOW,
          alertChannel: parsed.value.deliveryMode !== "silent" && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_DESTINATION ? "telegram" : undefined,
          alertDestinationKey: parsed.value.deliveryMode !== "silent" && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_DESTINATION ? env.TELEGRAM_DESTINATION : undefined,
          sourceHealthKey: source?.healthKey,
          postgresStore,
        });
        if (parsed.value.deliveryMode !== "silent" && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_DESTINATION) {
          await dispatchOne(env.DB, createTelegramClient(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_DESTINATION));
        }
        if (outcome.action === "ack") message.ack();
        else message.retry({ delaySeconds: outcome.delaySeconds });
      } catch {
        message.retry({ delaySeconds: 60 });
      }
    }
  }
};

export default worker;
