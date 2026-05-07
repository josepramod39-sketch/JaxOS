import { join } from "path";
import { homedir } from "os";

const JAXOS_HOME = join(homedir(), "jaxos");

export function personasDir() {
  return join(JAXOS_HOME, "personas");
}

export async function savePersona(name: string, content: string) {
  const dir = personasDir();
  // Ensure directory exists
  await Bun.$`mkdir -p ${dir}`;
  await Bun.write(join(dir, `${name}.md`), content);
}

export async function listPersonas(): Promise<string[]> {
  const dir = personasDir();
  const glob = new Bun.Glob("*.md");
  const files: string[] = [];
  try {
    for await (const f of glob.scan(dir)) files.push(f.replace(".md", ""));
  } catch {
    return [];
  }
  return files.sort();
}

export async function loadPersona(name: string): Promise<string | null> {
  const dir = personasDir();
  const path = join(dir, `${name}.md`);
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return file.text();
}
