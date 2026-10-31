import type { UserProfile } from "../domain/profile";

export interface JudgeEvaluationInput {
  title: string;
  company?: string | null;
  description: string;
  heuristicScore: number;
}

export interface JudgeEvaluationResult {
  source: "gemini" | "openrouter" | "heuristic_fallback";
  isRealJobOpportunity: boolean;
  score: number;
  potentialScore: number;
  declaredLevel: string;
  operationalLevel: string;
  mandatoryRequirements: string[];
  desirableRequirements: string[];
  hardBarriers: string[];
  matchedEvidence: string[];
  trainableGaps: string[];
  category: "COMPATIVEL" | "POTENCIALMENTE_COMPATIVEL" | "DESAFIADORA_VALIDA" | "INCOMPATIVEL";
  reasoning: string;
  recommendation: "APPLY_NOW" | "MAYBE" | "SKIP";
}

export interface LlmJudgeOptions {
  profile: UserProfile;
  geminiApiKey?: string;
  geminiModel?: string;
  openrouterApiKey?: string;
  openrouterModel?: string;
  fetcher?: typeof fetch;
}

export function buildJudgePrompt(profile: UserProfile, title: string, company: string, description: string): string {
  const profileJson = JSON.stringify(profile, null, 2);
  return `Você é um triador técnico de vagas para um candidato específico.
Analise se o texto abaixo é uma vaga real de desenvolvedor compatível com o perfil.

PERFIL DO CANDIDATO:
${profileJson}

TÍTULO: ${title}
EMPRESA: ${company}
DESCRIÇÃO:
${description.slice(0, 3000)}

Regras de julgamento:
- Se NÃO for uma oportunidade de vaga real (despedida, desabafo, notícia institucional, vaga não-dev), marque is_real_job_opportunity=false.
- Conte competências demonstradas em projetos próprios como evidência prática de aderência técnica.
- Não converta projetos próprios em anos de experiência profissional nem em senioridade formal.
- Considere CI/CD, cloud, testes e deploy competências reais quando houver evidência de implementação no perfil.
- Se exigir graduação completa OBRIGATÓRIA (não apenas preferencial), marque cv_compatibility_score <= 20.
- Se for vaga PCD exclusiva/afirmativa, marque is_real_job_opportunity=false.
- Se for sênior/lead/gerente/especialista, marque cv_compatibility_score <= 10.
- Não trate o título como prova suficiente: estime também o nível operacional pelo escopo das responsabilidades.
- Separe requisitos obrigatórios de diferenciais e identifique lacunas treináveis.
- Uma vaga Pleno com acompanhamento, correções simples e tarefas de entrada pode ser uma oportunidade de progressão.

Responda APENAS com o JSON abaixo, sem markdown, sem texto extra:
{"is_real_job_opportunity": bool, "cv_compatibility_score": int, "potential_score": int, "declared_level": "junior|mid|senior|unknown", "operational_level": "junior|junior_to_mid|mid|senior|unknown", "mandatory_requirements": ["string"], "desirable_requirements": ["string"], "hard_barriers": ["string"], "matched_evidence": ["string"], "trainable_gaps": ["string"], "category": "COMPATIVEL|POTENCIALMENTE_COMPATIVEL|DESAFIADORA_VALIDA|INCOMPATIVEL", "reasoning": "string curta", "recommendation": "APPLY_NOW|MAYBE|SKIP"}`;
}

export function normalizeJudgeResult(raw: Record<string, unknown>, fallbackScore = 0): Omit<JudgeEvaluationResult, "source"> {
  const score = typeof raw.cv_compatibility_score === "number" ? raw.cv_compatibility_score : fallbackScore;
  const potential = typeof raw.potential_score === "number" ? raw.potential_score : score;
  const barriers: string[] = Array.isArray(raw.hard_barriers) ? (raw.hard_barriers as string[]) : [];

  let category: JudgeEvaluationResult["category"] = "INCOMPATIVEL";
  if (barriers.length > 0) {
    category = "INCOMPATIVEL";
  } else if (typeof raw.category === "string" && ["COMPATIVEL", "POTENCIALMENTE_COMPATIVEL", "DESAFIADORA_VALIDA", "INCOMPATIVEL"].includes(raw.category)) {
    category = raw.category as JudgeEvaluationResult["category"];
  } else {
    category = score >= 60 ? "COMPATIVEL" : potential >= 45 ? "POTENCIALMENTE_COMPATIVEL" : potential >= 35 ? "DESAFIADORA_VALIDA" : "INCOMPATIVEL";
  }

  return {
    isRealJobOpportunity: typeof raw.is_real_job_opportunity === "boolean" ? raw.is_real_job_opportunity : true,
    score,
    potentialScore: potential,
    declaredLevel: typeof raw.declared_level === "string" ? raw.declared_level : "unknown",
    operationalLevel: typeof raw.operational_level === "string" ? raw.operational_level : typeof raw.declared_level === "string" ? raw.declared_level : "unknown",
    mandatoryRequirements: Array.isArray(raw.mandatory_requirements) ? (raw.mandatory_requirements as string[]) : [],
    desirableRequirements: Array.isArray(raw.desirable_requirements) ? (raw.desirable_requirements as string[]) : [],
    hardBarriers: barriers,
    matchedEvidence: Array.isArray(raw.matched_evidence) ? (raw.matched_evidence as string[]) : [],
    trainableGaps: Array.isArray(raw.trainable_gaps) ? (raw.trainable_gaps as string[]) : [],
    category,
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
    recommendation: typeof raw.recommendation === "string" && ["APPLY_NOW", "MAYBE", "SKIP"].includes(raw.recommendation)
      ? (raw.recommendation as JudgeEvaluationResult["recommendation"])
      : score >= 60 ? "APPLY_NOW" : "SKIP",
  };
}

export class LlmJudge {
  private readonly profile: UserProfile;
  private readonly geminiApiKey?: string;
  private readonly geminiModel: string;
  private readonly openrouterApiKey?: string;
  private readonly openrouterModel: string;
  private readonly fetcher: typeof fetch;

  constructor(options: LlmJudgeOptions) {
    this.profile = options.profile;
    this.geminiApiKey = options.geminiApiKey;
    this.geminiModel = options.geminiModel || "gemini-3.5-flash-lite";
    this.openrouterApiKey = options.openrouterApiKey;
    this.openrouterModel = options.openrouterModel || "google/gemini-2.5-flash-lite";
    this.fetcher = (options.fetcher ?? globalThis.fetch).bind(globalThis);
  }

  async evaluate(input: JudgeEvaluationInput): Promise<JudgeEvaluationResult> {
    const prompt = buildJudgePrompt(
      this.profile,
      input.title,
      input.company || "Empresa",
      input.description
    );

    // 1. Tentar Gemini se a chave estiver presente
    if (this.geminiApiKey) {
      try {
        const geminiResult = await this.callGemini(prompt);
        if (geminiResult) {
          const normalized = normalizeJudgeResult(geminiResult, input.heuristicScore);
          return { ...normalized, source: "gemini" };
        }
      } catch (err) {
        console.warn(`[LlmJudge] Gemini invocation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 2. Tentar OpenRouter como fallback na cadeia
    if (this.openrouterApiKey) {
      try {
        const openrouterResult = await this.callOpenrouter(prompt);
        if (openrouterResult) {
          const normalized = normalizeJudgeResult(openrouterResult, input.heuristicScore);
          return { ...normalized, source: "openrouter" };
        }
      } catch (err) {
        console.warn(`[LlmJudge] OpenRouter invocation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 3. Fallback Heurístico Gracioso
    const heuristicNormalized = normalizeJudgeResult(
      {
        is_real_job_opportunity: true,
        cv_compatibility_score: input.heuristicScore,
        potential_score: input.heuristicScore,
        category: input.heuristicScore >= 60 ? "COMPATIVEL" : "INCOMPATIVEL",
        reasoning: "Score atribuído via motor heurístico por ausência ou falha temporária dos provedores de IA.",
        recommendation: input.heuristicScore >= 60 ? "APPLY_NOW" : "SKIP",
      },
      input.heuristicScore
    );

    return { ...heuristicNormalized, source: "heuristic_fallback" };
  }

  private async callGemini(prompt: string): Promise<Record<string, unknown> | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent`;
    const payload = {
      system_instruction: { parts: [{ text: "Responda somente com JSON válido." }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    };

    const res = await this.fetcher(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": this.geminiApiKey!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`[LlmJudge] Gemini HTTP error: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;
    return JSON.parse(rawText.trim());
  }

  private async callOpenrouter(prompt: string): Promise<Record<string, unknown> | null> {
    const url = "https://openrouter.ai/api/v1/chat/completions";
    const payload = {
      model: this.openrouterModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Responda somente com JSON válido." },
        { role: "user", content: prompt },
      ],
    };

    const res = await this.fetcher(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.openrouterApiKey!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`[LlmJudge] OpenRouter HTTP error: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawText = data?.choices?.[0]?.message?.content;
    if (!rawText) return null;
    return JSON.parse(rawText.trim());
  }
}
