const TRACKING_KEYS = new Set([
  "trk",
  "trackingid",
  "lipi",
  "refid",
  "position",
  "currentjobid",
  "jobboardsource",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
]);

const TRUSTED_JOB_HOSTS = new Set([
  "gupy.io",
  "greenhouse.io",
  "lever.co",
  "trampos.co",
  "geekhunter.com.br",
  "geekhunter.com",
  "linkedin.com",
]);

function isTrustedHost(host: string): boolean {
  const clean = host.toLowerCase().trim();
  for (const trusted of TRUSTED_JOB_HOSTS) {
    if (clean === trusted || clean.endsWith("." + trusted)) {
      return true;
    }
  }
  return false;
}

/**
 * Normaliza URLs de vagas:
 * - Remove parâmetros de rastreamento e analytics (UTM, trk, trackingId, etc.)
 * - Decodifica payloads base64 da Gupy (/job/<base64> -> /jobs/<id>)
 */
export function normalizeJobUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());

    // 1. Decodificação Gupy Base64
    if (parsed.hostname.includes("gupy.io")) {
      const match = parsed.pathname.match(/\/job\/([^/]+)/);
      if (match && match[1]) {
        const token = match[1];
        if (!/^\d+$/.test(token)) {
          try {
            // Buffer base64url decode
            const decodedStr = Buffer.from(token, "base64url").toString("utf-8");
            const payload = JSON.parse(decodedStr);
            if (payload && payload.jobId) {
              parsed.pathname = `/jobs/${payload.jobId}`;
            }
          } catch {
            // Se falhar a decodificação JSON, mantém o path original
          }
        }
      }
    }

    // 2. Limpeza de Query Parameters de Tracking
    const searchParams = new URLSearchParams(parsed.search);
    const keysToRemove: string[] = [];

    for (const key of searchParams.keys()) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || TRACKING_KEYS.has(lower)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      searchParams.delete(key);
    }

    parsed.search = searchParams.toString();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return rawUrl;
  }
}

/**
 * Resolve encurtadores conhecidos (ex: lnkd.in) seguindo redirecionamentos HTTP
 * Valida a lista de destinos confiáveis (SSRF protection)
 */
export async function resolveShortUrl(
  shortUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const parsed = new URL(shortUrl);
    if (parsed.hostname.toLowerCase() !== "lnkd.in" && !parsed.hostname.includes("lnkd.in")) {
      return normalizeJobUrl(shortUrl);
    }

    const response = await fetcher(shortUrl, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "Argus vacancy discovery" },
    });

    const location = response.headers.get("Location") || response.headers.get("location");
    if (!location) {
      return null;
    }

    const targetUrl = new URL(location, shortUrl);
    if (!isTrustedHost(targetUrl.hostname)) {
      return null;
    }

    return normalizeJobUrl(targetUrl.toString());
  } catch {
    return null;
  }
}

export interface FetchedJobMetadata {
  title?: string;
  organization?: string;
  description?: string;
}

/**
 * Busca metadados públicos (OpenGraph, <title> e <meta description>) da página da vaga.
 * Protegido com timeout e restrito a hosts confiáveis (SSRF safe).
 */
export async function fetchJobMetadata(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<FetchedJobMetadata> {
  try {
    const parsed = new URL(url);
    if (!isTrustedHost(parsed.hostname)) {
      return {};
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const response = await fetcher(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);

    if (!response.ok) return {};

    const html = await response.text();

    // 1. Título
    let title: string | undefined;
    const ogTitle = html.match(/<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["']/i);
    if (ogTitle) {
      title = ogTitle[1];
    } else {
      const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleTag) title = titleTag[1];
    }

    // 2. Descrição
    let description: string | undefined;
    const ogDesc = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description|twitter:description)["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|description|twitter:description)["']/i);
    if (ogDesc) {
      description = ogDesc[1];
    }

    // 3. Organização / Site
    let organization: string | undefined;
    const ogSite = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
    if (ogSite) {
      organization = ogSite[1];
    }

    // Se o título vier no formato "Cargo em Empresa" (ex: "Desenvolvedor Node.js em NTT DATA")
    if (title && !organization) {
      const parts = title.split(/\s+(?:em|na|no|at|-|\|)\s+/i);
      if (parts.length >= 2) {
        organization = parts[parts.length - 1].trim();
      }
    }

    return {
      title: title ? title.replace(/&amp;/g, "&").trim() : undefined,
      description: description ? description.replace(/&amp;/g, "&").trim() : undefined,
      organization: organization ? organization.replace(/&amp;/g, "&").trim() : undefined,
    };
  } catch {
    return {};
  }
}
