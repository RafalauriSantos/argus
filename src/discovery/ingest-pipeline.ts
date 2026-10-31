import type { PostgresStore } from "../storage/postgres-store";
import { evaluateVacancyScope } from "../decision/scope-analyzer";
import type { UserProfile } from "../domain/profile";
import { DEFAULT_USER_PROFILE } from "../domain/profile";
import { createVacancy } from "../domain/vacancy";

export interface DiscoveredObservation {
  sourceId: string;
  sourceVacancyId: string;
  canonicalUrl: string;
  title: string;
  organization?: string | null;
  location?: string | null;
  workModel?: "remote" | "hybrid" | "onsite" | "unknown";
  descriptionSummary?: string | null;
  publishedAt?: string | null;
  queryId: string;
  observedAt: string;
  fingerprint?: string;
  roundId?: string | null;
}

export interface IngestResult {
  status: "ACCEPTED" | "REJECTED";
  vacancyId?: string;
  score?: number;
  rejectionReason?: string;
  outboxEnqueued: boolean;
}

export class IngestPipeline {
  constructor(
    private readonly store: PostgresStore,
    private readonly profile: UserProfile = DEFAULT_USER_PROFILE
  ) {}

  async processObservation(obs: DiscoveredObservation): Promise<IngestResult> {
    // 1. Avaliação de Escopo & Perfil (Cérebro do WorkHunter)
    const scope = evaluateVacancyScope(
      obs.title,
      obs.descriptionSummary || "",
      obs.location || "",
      obs.workModel || "unknown",
      this.profile
    );

    // 2. Se a vaga for rejeitada, grava no histórico de descartes do Neon sem duplicar
    if (!scope.eligible) {
      await this.store.recordRejection({
        source: obs.sourceId,
        sourceJobId: obs.sourceVacancyId,
        title: obs.title,
        stage: "scope_analyzer",
        reason: scope.reason,
        url: obs.canonicalUrl,
        publishedAt: obs.publishedAt || "",
      });

      return {
        status: "REJECTED",
        rejectionReason: scope.reason,
        outboxEnqueued: false,
      };
    }

    // 3. Se a vaga for aceita, cria a entidade canônica de vaga
    const vacancy = createVacancy({
      canonicalUrl: obs.canonicalUrl,
      title: obs.title,
      organization: obs.organization,
      location: obs.location,
      workModel: obs.workModel,
      descriptionSummary: obs.descriptionSummary,
      publishedAt: obs.publishedAt,
      sourceId: obs.sourceId,
      sourceVacancyId: obs.sourceVacancyId,
    });

    // 4. Upsert atômico no Neon PostgreSQL
    const upsert = await this.store.upsertVacancy({
      id: vacancy.id,
      canonicalUrl: vacancy.canonicalUrl,
      title: vacancy.title,
      organization: vacancy.organization,
      location: vacancy.location,
      workModel: vacancy.workModel,
      descriptionSummary: vacancy.descriptionSummary,
      publishedAt: vacancy.publishedAt,
      fingerprint: vacancy.fingerprint,
      sourceId: obs.sourceId,
      sourceVacancyId: obs.sourceVacancyId,
      queryId: obs.queryId,
      roundId: obs.roundId,
    });

    // 5. Se foi recém-inserida e atingiu o piso de relevância (score >= 60), enfileira no Outbox do Telegram
    let outboxEnqueued = false;
    if (upsert.inserted && scope.score >= 60) {
      const outboxPayload = {
        title: `${vacancy.title} · ${vacancy.organization || "Empresa"}`,
        organization: vacancy.organization,
        location: vacancy.location,
        url: vacancy.canonicalUrl,
        score: scope.score,
        matchedStack: scope.matchedStack,
        cautions: scope.cautions,
        stage: "final",
      };

      outboxEnqueued = await this.store.enqueueNotification(
        "alert:" + upsert.vacancyId,
        "telegram",
        outboxPayload
      );
    }

    return {
      status: "ACCEPTED",
      vacancyId: upsert.vacancyId,
      score: scope.score,
      outboxEnqueued,
    };
  }
}
