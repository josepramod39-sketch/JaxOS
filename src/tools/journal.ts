import { join } from "path";
import { homedir } from "os";

const JAXOS_HOME = join(homedir(), "jaxos");

export function researchDir() {
  return join(JAXOS_HOME, "research");
}

export async function savePaper(slug: string, content: string) {
  const dir = researchDir();
  await Bun.write(join(dir, `${slug}.md`), content);
}

export async function listPapers(): Promise<string[]> {
  const dir = researchDir();
  const glob = new Bun.Glob("*.md");
  const files: string[] = [];
  for await (const f of glob.scan(dir)) files.push(f.replace(".md", ""));
  return files.sort();
}

export async function loadPaper(slug: string): Promise<string | null> {
  const path = join(researchDir(), `${slug}.md`);
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return file.text();
}

export function makeSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
