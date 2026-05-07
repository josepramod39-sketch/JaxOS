export interface ScholarPaper {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  authors: string[];
  citationCount?: number;
  url?: string;
}

export async function getCitations(paperId: string, limit = 10): Promise<ScholarPaper[]> {
  try {
    // Note: arXiv IDs need to be prefixed for Semantic Scholar
    const id = paperId.startsWith("arxiv:") ? paperId : `ARXIV:${paperId}`;
    const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/${id}/citations?fields=title,authors,year,abstract,citationCount,url&limit=${limit}`);
    if (!res.ok) return [];
    const json = await res.json() as { data: { citingPaper: any }[] };
    return json.data.map(d => ({
      paperId: d.citingPaper.paperId,
      title: d.citingPaper.title,
      abstract: d.citingPaper.abstract,
      year: d.citingPaper.year,
      authors: d.citingPaper.authors?.map((a: any) => a.name) || [],
      citationCount: d.citingPaper.citationCount,
      url: d.citingPaper.url,
    }));
  } catch {
    return [];
  }
}

export async function getReferences(paperId: string, limit = 10): Promise<ScholarPaper[]> {
  try {
    const id = paperId.startsWith("arxiv:") ? paperId : `ARXIV:${paperId}`;
    const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/${id}/references?fields=title,authors,year,abstract,citationCount,url&limit=${limit}`);
    if (!res.ok) return [];
    const json = await res.json() as { data: { citedPaper: any }[] };
    return json.data.map(d => ({
      paperId: d.citedPaper.paperId,
      title: d.citedPaper.title,
      abstract: d.citedPaper.abstract,
      year: d.citedPaper.year,
      authors: d.citedPaper.authors?.map((a: any) => a.name) || [],
      citationCount: d.citedPaper.citationCount,
      url: d.citedPaper.url,
    }));
  } catch {
    return [];
  }
}
