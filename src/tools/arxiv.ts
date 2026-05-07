export interface Paper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  url: string;
  published: string;
}

export async function fetchByArxivId(id: string): Promise<Paper | null> {
  // strip url prefix if pasted
  const clean = id.replace(/.*arxiv\.org\/(abs|pdf)\//, "").replace(".pdf", "").trim();
  const url = `https://export.arxiv.org/api/query?id_list=${clean}`;
  const xml = await (await fetch(url)).text();
  return parseArxivXml(xml)[0] ?? null;
}

export async function searchArxiv(query: string, maxResults = 5): Promise<Paper[]> {
  const q = encodeURIComponent(query);
  const url = `https://export.arxiv.org/api/query?search_query=all:${q}&max_results=${maxResults}&sortBy=relevance`;
  const xml = await (await fetch(url)).text();
  return parseArxivXml(xml);
}

function parseArxivXml(xml: string): Paper[] {
  const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];
  return entries.map((entry) => {
    const get = (tag: string) =>
      entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? "";
    const id = get("id").replace("http://arxiv.org/abs/", "").split("v")[0] ?? "";
    const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1]?.trim() ?? "");
    return {
      id,
      title: get("title").replace(/\s+/g, " "),
      authors,
      abstract: get("summary").replace(/\s+/g, " "),
      url: `https://arxiv.org/abs/${id}`,
      published: get("published").slice(0, 10),
    };
  });
}
