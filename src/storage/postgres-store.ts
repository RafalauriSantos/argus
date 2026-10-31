import { getDatabaseClient } from "./neon";

export interface VacancyInput {
  id: string;
  canonicalUrl: string;
  title: string;
  organization?: string | null;
  location?: string | null;
  workModel?: string;
  descriptionSummary?: string | null;
  publishedAt?: string | null;
  fingerprint: string;
  sourceId: string;
  sourceVacancyId: string;
  queryId: string;
  roundId?: string | null;
}

export interface RejectionInput {
  source: string;
  sourceJobId: string;
  title: string;
  stage: string;
  reason: string;
  url?: string;
  publishedAt?: string;
}

export class PostgresStore {
  private sql: ReturnType<typeof getDatabaseClient>;

  constructor(databaseUrl: string) {
    this.sql = getDatabaseClient(databaseUrl);
  }

  /**
   * Grava uma vaga com deduplicação atômica via ON CONFLICT.
   * Se a vaga já existir (por URL ou fingerprint), atualiza last_observed_at sem duplicar.
   */
  async upsertVacancy(input: VacancyInput): Promise<{ inserted: boolean; vacancyId: string }> {
    const published = input.publishedAt ? new Date(input.publishedAt).toISOString() : null;

    // 1. Inserir ou atualizar na tabela de vagas
    const [row] = await this.sql`
      INSERT INTO haadar.vacancies (
        id, canonical_url, title, organization, location, work_model,
        description_summary, published_at, fingerprint, first_observed_at, last_observed_at
      ) VALUES (
        ${input.id}, ${input.canonicalUrl}, ${input.title}, ${input.organization ?? null},
        ${input.location ?? null}, ${input.workModel ?? 'unknown'}, ${input.descriptionSummary ?? null},
        ${published}, ${input.fingerprint}, NOW(), NOW()
      )
      ON CONFLICT (fingerprint) DO UPDATE SET
        last_observed_at = NOW(),
        updated_at = NOW()
      RETURNING id, (xmax = 0) AS inserted;
    `;

    const vacancyId = String(row.id);
    const inserted = Boolean(row.inserted);

    // 2. Vincular identidade de origem (ex: gupy:12345)
    await this.sql`
      INSERT INTO haadar.vacancy_source_identities (
        source_id, source_vacancy_id, vacancy_id, first_observed_at, last_observed_at
      ) VALUES (
        ${input.sourceId}, ${input.sourceVacancyId}, ${vacancyId}, NOW(), NOW()
      )
      ON CONFLICT (source_id, source_vacancy_id) DO UPDATE SET
        last_observed_at = NOW();
    `;

    // 3. Registrar a ocorrência na rodada atual
    await this.sql`
      INSERT INTO haadar.vacancy_occurrences (
        vacancy_id, round_id, source_id, source_vacancy_id, query_id, observed_url, observed_at
      ) VALUES (
        ${vacancyId}, ${input.roundId ?? null}, ${input.sourceId}, ${input.sourceVacancyId},
        ${input.queryId}, ${input.canonicalUrl}, NOW()
      )
      ON CONFLICT (vacancy_id, round_id, query_id, source_id) DO NOTHING;
    `;

    return { inserted, vacancyId };
  }

  /**
   * Grava rejeição de vaga com incremento de ocorrências (UPSERT).
   * Impede que a mesma vaga gere 2.500 linhas como acontecia no WorkHunter anterior!
   */
  async recordRejection(input: RejectionInput): Promise<void> {
    await this.sql`
      INSERT INTO haadar.candidate_rejections (
        source, source_job_id, title, stage, reason, url, published_at,
        first_rejected_at, last_rejected_at, occurrences_count
      ) VALUES (
        ${input.source}, ${input.sourceJobId}, ${input.title}, ${input.stage},
        ${input.reason}, ${input.url ?? ''}, ${input.publishedAt ?? ''},
        NOW(), NOW(), 1
      )
      ON CONFLICT (source, source_job_id, stage, reason) DO UPDATE SET
        last_rejected_at = NOW(),
        occurrences_count = haadar.candidate_rejections.occurrences_count + 1;
    `;
  }

  /**
   * Enfileira alerta na fila de notificações do Neon (haadar.notification_outbox)
   */
  async enqueueNotification(idempotencyKey: string, channel: string, payload: Record<string, unknown>): Promise<boolean> {
    const result = await this.sql`
      INSERT INTO haadar.notification_outbox (
        idempotency_key, channel, payload_json, status, attempts, created_at
      ) VALUES (
        ${idempotencyKey}, ${channel}, ${JSON.stringify(payload)},
        'pending', 0, NOW()
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id;
    `;
    return result.length > 0;
  }

  /**
   * Obtém métricas do funil das últimas 24h para o relatório diário
   */
  async getDailyFunnelStats(): Promise<{
    vacanciesObserved: number;
    rejectionsCount: number;
    topRejectionReasons: Array<{ reason: string; count: number }>;
  }> {
    const [vacanciesRow] = await this.sql`
      SELECT COUNT(*)::int AS total
      FROM haadar.vacancies
      WHERE last_observed_at >= NOW() - INTERVAL '24 hours';
    `;

    const [rejectionsRow] = await this.sql`
      SELECT COALESCE(SUM(occurrences_count), 0)::int AS total
      FROM haadar.candidate_rejections
      WHERE last_rejected_at >= NOW() - INTERVAL '24 hours';
    `;

    const reasons = await this.sql`
      SELECT reason, SUM(occurrences_count)::int AS count
      FROM haadar.candidate_rejections
      WHERE last_rejected_at >= NOW() - INTERVAL '24 hours'
      GROUP BY reason
      ORDER BY count DESC
      LIMIT 5;
    `;

    return {
      vacanciesObserved: vacanciesRow?.total || 0,
      rejectionsCount: rejectionsRow?.total || 0,
      topRejectionReasons: reasons.map(r => ({ reason: String(r.reason), count: Number(r.count) })),
    };
  }

  /**
   * Obtém as últimas decisões registradas no Neon (vagas aprovadas e descartadas)
   */
  async getLatestDecisions(limit = 5): Promise<Array<{
    timestamp: string;
    source: string;
    title: string;
    decision: string;
    reason: string | null;
  }>> {
    // Busca as últimas rejeições e vagas aceitas
    const rejections = await this.sql`
      SELECT 
        last_rejected_at AS "timestamp",
        source,
        title,
        'DISCARDED' AS decision,
        reason
      FROM haadar.candidate_rejections
      ORDER BY last_rejected_at DESC
      LIMIT ${limit};
    `;

    const accepted = await this.sql`
      SELECT 
        created_at AS "timestamp",
        source_id AS source,
        title,
        'ACCEPTED' AS decision,
        NULL::text AS reason
      FROM haadar.vacancies
      ORDER BY created_at DESC
      LIMIT ${limit};
    `;

    // Unifica e ordena pelas mais recentes
    const combined = [
      ...rejections.map(r => ({
        timestamp: new Date(r.timestamp as string).toISOString(),
        source: String(r.source),
        title: String(r.title),
        decision: String(r.decision),
        reason: r.reason ? String(r.reason) : null,
      })),
      ...accepted.map(a => ({
        timestamp: new Date(a.timestamp as string).toISOString(),
        source: String(a.source),
        title: String(a.title),
        decision: String(a.decision),
        reason: null,
      })),
    ];

    combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return combined.slice(0, limit);
  }

  /**
   * Obtém a distribuição de vagas por fonte nas últimas 24h
   */
  async getSourceBreakdown(): Promise<Array<{ source: string; count: number }>> {
    const rows = await this.sql`
      SELECT source_id AS source, COUNT(*)::int AS count
      FROM haadar.vacancies
      WHERE last_observed_at >= NOW() - INTERVAL '24 hours'
      GROUP BY source_id
      ORDER BY count DESC;
    `;

    return rows.map(r => ({
      source: String(r.source),
      count: Number(r.count),
    }));
  }

  /**
   * Obtém status operacional rápido do banco
   */
  async getStoreStatus(): Promise<{
    dbConnected: boolean;
    totalVacancies: number;
    rejections24h: number;
    lastObservedAt: string | null;
  }> {
    try {
      const [vacRow] = await this.sql`
        SELECT COUNT(*)::int AS total, MAX(last_observed_at) AS last_observed
        FROM haadar.vacancies;
      `;
      const [rejRow] = await this.sql`
        SELECT COALESCE(SUM(occurrences_count), 0)::int AS total
        FROM haadar.candidate_rejections
        WHERE last_rejected_at >= NOW() - INTERVAL '24 hours';
      `;

      return {
        dbConnected: true,
        totalVacancies: vacRow?.total || 0,
        rejections24h: rejRow?.total || 0,
        lastObservedAt: vacRow?.last_observed ? new Date(vacRow.last_observed as string).toISOString() : null,
      };
    } catch {
      return {
        dbConnected: false,
        totalVacancies: 0,
        rejections24h: 0,
        lastObservedAt: null,
      };
    }
  }

  /**
   * Limpeza automática com TTL (Time-To-Live).
   * Apaga descartes com mais de X dias para manter o banco leve para sempre.
   */
  async pruneOldRejections(daysRetention: number = 14): Promise<number> {
    const result = await this.sql`
      DELETE FROM haadar.candidate_rejections
      WHERE last_rejected_at < NOW() - (${daysRetention} || ' days')::INTERVAL
      RETURNING id;
    `;
    return result.length;
  }
}

