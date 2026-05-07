import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface Props {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  mode: string;
  voiceEnabled?: boolean;
  onVoiceRequest?: () => Promise<string>;
}

export function InputBar({ onSubmit, disabled, mode, voiceEnabled, onVoiceRequest }: Props) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);

  useInput(async (input, key) => {
    if (disabled || listening) return;

    if (key.ctrl && input === "v" && voiceEnabled && onVoiceRequest) {
      setListening(true);
      const text = await onVoiceRequest();
      setListening(false);
      if (text) {
        setValue((v) => (v ? `${v} ${text}` : text));
      }
      return;
    }

    if (key.return) {
      const trimmed = value.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setValue("");
      }
      return;
    }
    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      return;
    }
    if (!key.ctrl && !key.meta && input) {
      setValue((v) => v + input);
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Box width={2} flexShrink={0}>
          <Text color={listening ? "red" : "cyan"}>{listening ? "⏺" : "▎"}</Text>
        </Box>
        {listening ? (
          <Text color="red" italic dimColor> listening...</Text>
        ) : (
          <Box flexGrow={1}>
            <Text>{value || " "}</Text>
            {!disabled && <Text color="cyan">█</Text>}
          </Box>
        )}
      </Box>
      <Box paddingLeft={2}>
        <Text color="cyan" dimColor>{mode}</Text>
        <Text color="gray" dimColor>
          {"  ·  "}
          {voiceEnabled && <Text color="gray" dimColor>ctrl+v mic  ·  </Text>}
          enter to send  ·  ctrl+c quit
        </Text>
      </Box>
    </Box>
  );
}
