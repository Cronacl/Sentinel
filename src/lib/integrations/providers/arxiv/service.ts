import "server-only";

const ARXIV_API = "https://export.arxiv.org/api/query";

type ArxivPaper = {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  updated: string;
  categories: string[];
  pdfUrl: string;
  absUrl: string;
  comment: string | null;
  journalRef: string | null;
  doi: string | null;
};

function extractText(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1]!.trim() : "";
}

function extractAttribute(xml: string, tag: string, attr: string): string {
  const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i");
  const match = xml.match(regex);
  return match ? match[1]! : "";
}

function extractAllText(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const results: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1]!.trim());
  }
  return results;
}

function parseEntry(entryXml: string): ArxivPaper {
  const id = extractText(entryXml, "id").replace("http://arxiv.org/abs/", "");
  const title = extractText(entryXml, "title").replace(/\s+/g, " ");
  const summary = extractText(entryXml, "summary").replace(/\s+/g, " ");

  const authorNames = extractAllText(entryXml, "name");

  const published = extractText(entryXml, "published");
  const updated = extractText(entryXml, "updated");

  const categoryMatches = entryXml.match(
    /<category[^>]*term="([^"]*)"/g,
  );
  const categories = (categoryMatches ?? []).map((m) => {
    const termMatch = m.match(/term="([^"]*)"/);
    return termMatch ? termMatch[1]! : "";
  });

  const pdfLinkMatch = entryXml.match(
    /<link[^>]*title="pdf"[^>]*href="([^"]*)"/,
  );
  const pdfUrl = pdfLinkMatch ? pdfLinkMatch[1]! : "";

  const absUrl = `https://arxiv.org/abs/${id}`;

  const comment = extractText(entryXml, "arxiv:comment") || null;
  const journalRef = extractText(entryXml, "arxiv:journal_ref") || null;
  const doi = extractText(entryXml, "arxiv:doi") || null;

  return {
    id,
    title,
    summary,
    authors: authorNames,
    published,
    updated,
    categories,
    pdfUrl,
    absUrl,
    comment,
    journalRef,
    doi,
  };
}

export class ArxivService {
  async search(
    query: string,
    maxResults: number,
    sortBy: string,
    start = 0,
  ): Promise<{ papers: ArxivPaper[]; totalResults: number }> {
    const params = new URLSearchParams({
      search_query: query,
      start: String(start),
      max_results: String(maxResults),
      sortBy,
      sortOrder: "descending",
    });

    const res = await fetch(`${ARXIV_API}?${params}`, {
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      throw new Error(`ArXiv API error: ${res.status} ${res.statusText}`);
    }

    const xml = await res.text();

    const totalMatch = xml.match(
      /<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/,
    );
    const totalResults = totalMatch ? Number(totalMatch[1]) : 0;

    const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];
    const papers = entries.map(parseEntry);

    return { papers, totalResults };
  }

  async getPaper(arxivId: string): Promise<ArxivPaper> {
    const cleanId = arxivId.replace(/^arxiv:/i, "").replace("https://arxiv.org/abs/", "");
    const params = new URLSearchParams({
      id_list: cleanId,
      max_results: "1",
    });

    const res = await fetch(`${ARXIV_API}?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`ArXiv API error: ${res.status} ${res.statusText}`);
    }

    const xml = await res.text();
    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) {
      throw new Error(`Paper not found: ${arxivId}`);
    }

    return parseEntry(entryMatch[0]);
  }
}
