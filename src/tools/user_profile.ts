import { join } from "path";
import { homedir } from "os";

const JAXOS_HOME = join(homedir(), "jaxos");
const PROFILE_PATH = join(JAXOS_HOME, "user_profile.json");

export interface UserProfile {
  researchInterests: string[];
  preferredStyle: string;
  longTermGoals: string[];
  lastUpdated: string;
}

export async function loadUserProfile(): Promise<UserProfile> {
  const file = Bun.file(PROFILE_PATH);
  if (!(await file.exists())) {
    return {
      researchInterests: [],
      preferredStyle: "Technical & Detailed",
      longTermGoals: [],
      lastUpdated: new Date().toISOString()
    };
  }
  try {
    return await file.json();
  } catch {
    return {
      researchInterests: [],
      preferredStyle: "Technical & Detailed",
      longTermGoals: [],
      lastUpdated: new Date().toISOString()
    };
  }
}

export async function saveUserProfile(profile: Partial<UserProfile>) {
  const current = await loadUserProfile();
  const updated = {
    ...current,
    ...profile,
    lastUpdated: new Date().toISOString()
  };
  await Bun.write(PROFILE_PATH, JSON.stringify(updated, null, 2));
}
