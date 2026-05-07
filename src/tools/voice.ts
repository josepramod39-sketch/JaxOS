const PYTHON_VENV = "/home/jax/Projects/open_source_agents/open_agent/.venv/bin/python3";
const BRIDGE_PATH = import.meta.dir + "/voice_bridge.py";

export async function transcribe(): Promise<string> {
  try {
    const { stdout } = await Bun.$`${PYTHON_VENV} ${BRIDGE_PATH} listen`.quiet();
    return stdout.toString().trim();
  } catch (e) {
    console.error("Transcription error:", e);
    return "";
  }
}

export async function speak(text: string): Promise<void> {
  try {
    await Bun.$`${PYTHON_VENV} ${BRIDGE_PATH} speak ${text}`.quiet();
  } catch (e) {
    console.error("Speak error:", e);
  }
}
