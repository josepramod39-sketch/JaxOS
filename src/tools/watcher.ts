import { join } from "path";
import { homedir } from "os";
import { watch } from "fs";

const DELEGATION_DIR = join(homedir(), "jaxos", "lab", "delegations");
const SYMLINK_NAME = "LAB_TASK.md";

console.log("🔭 OpenCode Lab Watcher v2.3 [ACTIVE BRIDGE]");
console.log(`📡 Monitoring: ${DELEGATION_DIR}`);
console.log(`💡 Instruction: To start the bridge, keep this terminal open.`);

// Ensure directory exists
await Bun.$`mkdir -p ${DELEGATION_DIR}`;

const watcher = watch(DELEGATION_DIR, async (event, filename) => {
  if (event === "rename" && filename && filename.endsWith(".md")) {
    const filePath = join(DELEGATION_DIR, filename);
    const file = Bun.file(filePath);
    
    if (await file.exists()) {
      const content = await file.text();
      
      // Only process PENDING tasks
      if (content.includes("**Status:** PENDING")) {
        console.log(`\n──────────────────────────────────────────────────`);
        console.log(`📬 NEW RESEARCH REQUEST: ${filename}`);
        
        const taskMatch = content.match(/\*\*Task:\*\* (.*)/);
        const task = taskMatch ? taskMatch[1] : "Unknown Task";
        
        // 1. Create a local reference for OpenCode
        await Bun.$`rm -f ${SYMLINK_NAME}`;
        await Bun.$`ln -s ${filePath} ${SYMLINK_NAME}`;

        console.log(`\n🛠️  BRIDGE COMMAND FOR OPENCODE:`);
        console.log(`\x1b[32m/read ${SYMLINK_NAME} then execute the task following the guardrails inside\x1b[0m`);
        
        console.log(`\n📋 TASK OVERVIEW:`);
        console.log(`"${task}"`);
        
        console.log(`\n⏳ Awaiting completion... (Update status to COMPLETED in the file)`);
        console.log(`──────────────────────────────────────────────────`);
      }
    }
  }
});

process.on("SIGINT", () => {
  console.log("\n🛑 Watcher shutting down.");
  watcher.close();
  process.exit();
});
