import { join } from "path";
import { homedir } from "os";

const JAXOS_HOME = join(homedir(), "jaxos");

export function skillsDir() {
  return join(JAXOS_HOME, "skills");
}

export async function saveSkill(name: string, content: string) {
  const dir = skillsDir();
  // Ensure directory exists
  await Bun.$`mkdir -p ${dir}`;
  await Bun.write(join(dir, `${name}.md`), content);
}

export async function listSkills(): Promise<string[]> {
  const dir = skillsDir();
  const glob = new Bun.Glob("*.md");
  const files: string[] = [];
  try {
    for await (const f of glob.scan(dir)) files.push(f.replace(".md", ""));
  } catch {
    return [];
  }
  return files.sort();
}

export async function loadSkill(name: string): Promise<string | null> {
  const dir = skillsDir();
  const path = join(dir, `${name}.md`);
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return file.text();
}
