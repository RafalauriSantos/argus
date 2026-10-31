import { describe, expect, it } from "vitest";
import { normalizeJobUrl, resolveShortUrl } from "../../src/discovery/url-resolver";

describe("Slice 9: URL Normalization & Link Resolution", () => {
  describe("normalizeJobUrl", () => {
    it("CR-9.2: remove parâmetros de tracking (utm_*, trk, trackingId, refId)", () => {
      const input = "https://empresa.gupy.io/jobs/12345?utm_source=linkedin&trk=public_jobs&trackingId=xyz&refId=abc";
      const normalized = normalizeJobUrl(input);
      expect(normalized).toBe("https://empresa.gupy.io/jobs/12345");
    });

    it("CR-9.1: decodifica link Gupy com payload Base64 para a URL canônica com ID numérico", () => {
      // payload: {"jobId": 7654321} codificado em base64url
      const payload = Buffer.from(JSON.stringify({ jobId: 7654321 })).toString("base64url");
      const input = `https://empresa.gupy.io/job/${payload}?utm_campaign=share`;
      const normalized = normalizeJobUrl(input);
      expect(normalized).toBe("https://empresa.gupy.io/jobs/7654321");
    });

    it("mantém URLs sem tracking intactas", () => {
      const input = "https://boards.greenhouse.io/empresa/jobs/998877";
      expect(normalizeJobUrl(input)).toBe(input);
    });
  });

  describe("resolveShortUrl", () => {
    it("CR-9.3: segue redirecionamento de lnkd.in apenas para domínios de trabalho confiáveis", async () => {
      const mockFetcher: typeof fetch = async (url) => {
        if (String(url).includes("lnkd.in/test1")) {
          return new Response(null, {
            status: 302,
            headers: { Location: "https://empresa.gupy.io/jobs/12345" },
          });
        }
        return new Response("Not Found", { status: 404 });
      };

      const resolved = await resolveShortUrl("https://lnkd.in/test1", mockFetcher);
      expect(resolved).toBe("https://empresa.gupy.io/jobs/12345");
    });

    it("CR-9.3: bloqueia redirecionamentos para hosts não confiáveis (prevenção SSRF/phishing)", async () => {
      const mockFetcher: typeof fetch = async () => {
        return new Response(null, {
          status: 302,
          headers: { Location: "https://site-malicioso.com/login" },
        });
      };

      const resolved = await resolveShortUrl("https://lnkd.in/malicious", mockFetcher);
      expect(resolved).toBeNull();
    });
  });

  describe("fetchJobMetadata", () => {
    it("extrai metadados públicos (título, descrição, organização) de página confiável", async () => {
      const { fetchJobMetadata } = await import("../../src/discovery/url-resolver");
      const mockHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Desenvolvedor Node.js em NTT DATA</title>
            <meta name="description" content="Sobre a vaga: Estamos em busca de Desenvolvedor Backend Sênior Node.js...">
            <meta property="og:site_name" content="GeekHunter">
          </head>
          <body></body>
        </html>
      `;

      const mockFetcher: typeof fetch = async () => {
        return new Response(mockHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      };

      const meta = await fetchJobMetadata("https://www.geekhunter.com/pt/ntt-data/jobs/desenvolvedor-node-js-43", mockFetcher);
      expect(meta.title).toBe("Desenvolvedor Node.js em NTT DATA");
      expect(meta.description).toContain("Desenvolvedor Backend Sênior Node.js");
      expect(meta.organization).toBe("GeekHunter");
    });

    it("retorna objeto vazio para hosts não confiáveis", async () => {
      const { fetchJobMetadata } = await import("../../src/discovery/url-resolver");
      const meta = await fetchJobMetadata("https://site-desconhecido.com/vaga/1");
      expect(meta).toEqual({});
    });
  });
});
