import sys
import os
import argparse

# Add the open_agent directory to sys.path so we can import voice.py
OPEN_AGENT_DIR = "/home/jax/Projects/open_source_agents/open_agent"
sys.path.append(OPEN_AGENT_DIR)

try:
    from voice import VoiceEngine
except ImportError as e:
    print(f"Error: Could not import VoiceEngine from {OPEN_AGENT_DIR}/voice.py")
    print(f"Original error: {e}")
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="JaxOS Voice Bridge")
    parser.add_argument("command", choices=["listen", "speak"], help="Command to run")
    parser.add_argument("text", nargs="?", help="Text to speak (for 'speak' command)")
    
    args = parser.parse_args()
    engine = VoiceEngine()

    if args.command == "listen":
        # Record until silence and transcribe
        text = engine.listen_and_transcribe()
        print(text)
    elif args.command == "speak":
        if not args.text:
            print("Error: 'speak' command requires text")
            sys.exit(1)
        engine.speak(args.text)

if __name__ == "__main__":
    main()
