import type { PostgresStore } from "../storage/postgres-store";
import { evaluateVacancyScope } from "../decision/scope-analyzer";
import type { UserProfile } from "../domain/profile";
import { DEFAULT_USER_PROFILE } from "../domain/profile";
import { createVacancy } from "../domain/vacancy";
import { normalizeJobUrl } from "./url-resolver";
import type { JudgeEvaluationResult, LlmJudge } from "../ai/llm-judge";

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
  inserted?: boolean;
  judgeResult?: JudgeEvaluationResult;
}

export class IngestPipeline {
  constructor(
    private readonly store: PostgresStore,
    private readonly profile: UserProfile = DEFAULT_USER_PROFILE,
    private readonly llmJudge?: LlmJudge
  ) {}

  async processObservation(obs: DiscoveredObservation): Promise<IngestResult> {
    const canonicalUrl = normalizeJobUrl(obs.canonicalUrl);

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
        url: canonicalUrl,
        publishedAt: obs.publishedAt || "",
      });

      return {
        status: "REJECTED",
        rejectionReason: scope.reason,
        outboxEnqueued: false,
      };
    }

    // 3. Avaliação Semântica com IA (LLM Judge) se habilitado
    let judgeResult: JudgeEvaluationResult | undefined;
    if (this.llmJudge) {
      judgeResult = await this.llmJudge.evaluate({
        title: obs.title,
        company: obs.organization || "Empresa",
        description: obs.descriptionSummary || "",
        heuristicScore: scope.score,
      });

      // Se a IA constatar que não é vaga de dev real, identificar barreiras, marcar sênior ou incompatível
      const isSeniorByJudge =
        judgeResult.declaredLevel === "senior" ||
        judgeResult.operationalLevel === "senior";

      if (
        !judgeResult.isRealJobOpportunity ||
        judgeResult.hardBarriers.length > 0 ||
        judgeResult.category === "INCOMPATIVEL" ||
        isSeniorByJudge
      ) {
        const barrierReason = isSeniorByJudge
          ? "Vaga classificada como nível Sênior pela IA (perfil do usuário é Júnior/Pleno)"
          : judgeResult.hardBarriers.length > 0
          ? judgeResult.hardBarriers.join("; ")
          : judgeResult.reasoning || "não compatível com o perfil";
        const aiRejectionReason = `Descartada pelo juiz de IA: ${barrierReason}`;

        await this.store.recordRejection({
          source: obs.sourceId,
          sourceJobId: obs.sourceVacancyId,
          title: obs.title,
          stage: "llm_judge",
          reason: aiRejectionReason,
          url: canonicalUrl,
          publishedAt: obs.publishedAt || "",
        });

        return {
          status: "REJECTED",
          rejectionReason: aiRejectionReason,
          outboxEnqueued: false,
          judgeResult,
        };
      }
    }

    // 4. Se a vaga for aceita, cria a entidade canônica de vaga
    const vacancy = createVacancy({
      canonicalUrl,
      title: obs.title,
      organization: obs.organization,
      location: obs.location,
      workModel: obs.workModel,
      descriptionSummary: obs.descriptionSummary,
      publishedAt: obs.publishedAt,
      sourceId: obs.sourceId,
      sourceVacancyId: obs.sourceVacancyId,
    });

    // 5. Upsert atômico no Neon PostgreSQL
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

    // 6. Se foi recém-inserida e atingiu o piso de relevância (score >= 60), enfileira no Outbox do Telegram
    let outboxEnqueued = false;
    const finalScore = judgeResult ? judgeResult.score : scope.score;

    if (upsert.inserted && finalScore >= 60) {
      const outboxPayload = {
        title: `${vacancy.title} · ${vacancy.organization || "Empresa"}`,
        organization: vacancy.organization,
        location: vacancy.location,
        url: vacancy.canonicalUrl,
        score: finalScore,
        matchedStack: scope.matchedStack,
        cautions: scope.cautions,
        stage: "final",
        aiSummary: judgeResult ? {
          source: judgeResult.source,
          category: judgeResult.category,
          recommendation: judgeResult.recommendation,
          reasoning: judgeResult.reasoning,
          matchedEvidence: judgeResult.matchedEvidence,
          trainableGaps: judgeResult.trainableGaps,
        } : undefined,
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
      score: finalScore,
      outboxEnqueued,
      inserted: upsert.inserted,
      judgeResult,
    };
  }
}
