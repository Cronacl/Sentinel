import "server-only";

const ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

type PubMedArticle = {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  journal: string;
  pubDate: string;
  doi: string | null;
  pmcId: string | null;
  url: string;
  keywords: string[];
};

type PubMedSearchResult = {
  articles: PubMedArticle[];
  totalResults: number;
};

function extractText(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1]!.trim() : "";
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

function parseArticle(articleXml: string): PubMedArticle {
  const pmid = extractText(articleXml, "PMID");
  const title = extractText(articleXml, "ArticleTitle").replace(/<[^>]*>/g, "");
  const abstractTexts = extractAllText(articleXml, "AbstractText");
  const abstract = abstractTexts.join(" ").replace(/<[^>]*>/g, "");

  const lastNames = extractAllText(articleXml, "LastName");
  const foreNames = extractAllText(articleXml, "ForeName");
  const authors = lastNames.map((ln, i) => {
    const fn = foreNames[i] ?? "";
    return fn ? `${fn} ${ln}` : ln;
  });

  const journal = extractText(articleXml, "Title");
  const year = extractText(articleXml, "Year");
  const month = extractText(articleXml, "Month");
  const pubDate = month ? `${year} ${month}` : year;

  const articleIdBlocks =
    articleXml.match(/<ArticleId[^>]*>[\s\S]*?<\/ArticleId>/g) ?? [];
  let doi: string | null = null;
  let pmcId: string | null = null;
  for (const block of articleIdBlocks) {
    if (block.includes('IdType="doi"')) {
      doi = extractText(block, "ArticleId");
    }
    if (block.includes('IdType="pmc"')) {
      pmcId = extractText(block, "ArticleId");
    }
  }

  const keywords = extractAllText(articleXml, "Keyword").map((k) =>
    k.replace(/<[^>]*>/g, ""),
  );

  return {
    pmid,
    title,
    abstract,
    authors,
    journal,
    pubDate,
    doi,
    pmcId,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    keywords,
  };
}

export class PubMedService {
  async search(
    query: string,
    maxResults: number,
    sort: string,
  ): Promise<PubMedSearchResult> {
    const searchParams = new URLSearchParams({
      db: "pubmed",
      term: query,
      retmax: String(maxResults),
      retmode: "json",
      sort,
    });

    const searchRes = await fetch(`${ESEARCH}?${searchParams}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!searchRes.ok) {
      throw new Error(
        `PubMed search error: ${searchRes.status} ${searchRes.statusText}`,
      );
    }

    const searchData = (await searchRes.json()) as {
      esearchresult: { idlist: string[]; count: string };
    };

    const ids = searchData.esearchresult.idlist;
    const totalResults = Number(searchData.esearchresult.count);

    if (ids.length === 0) {
      return { articles: [], totalResults: 0 };
    }

    const articles = await this.fetchArticles(ids);

    return { articles, totalResults };
  }

  async getArticle(pmid: string): Promise<PubMedArticle> {
    const articles = await this.fetchArticles([pmid.trim()]);
    if (articles.length === 0) {
      throw new Error(`Article not found: PMID ${pmid}`);
    }
    return articles[0]!;
  }

  private async fetchArticles(ids: string[]): Promise<PubMedArticle[]> {
    const fetchParams = new URLSearchParams({
      db: "pubmed",
      id: ids.join(","),
      rettype: "xml",
      retmode: "xml",
    });

    const fetchRes = await fetch(`${EFETCH}?${fetchParams}`, {
      signal: AbortSignal.timeout(20_000),
    });

    if (!fetchRes.ok) {
      throw new Error(
        `PubMed fetch error: ${fetchRes.status} ${fetchRes.statusText}`,
      );
    }

    const xml = await fetchRes.text();
    const entries =
      xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) ?? [];

    return entries.map(parseArticle);
  }
}
