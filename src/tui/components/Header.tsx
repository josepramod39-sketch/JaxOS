import React from "react";
import { Box, Text } from "ink";

const MODES = ["research", "code", "innovate", "company", "garage"] as const;
export type Mode = (typeof MODES)[number];

interface Props {
  mode: Mode;
  modelReady: boolean;
  model: string;
  tokenCount: number;
  tokenPct: number;
  effort: string;
}

export function Header({ mode, modelReady, model, tokenCount, tokenPct, effort }: Props) {
  const modelShort = model.split("/").pop() ?? model;
  return (
    <Box justifyContent="space-between" paddingBottom={1}>
      <Box gap={3}>
        <Text bold color="cyan">jaxos</Text>
        <Box gap={2}>
          {MODES.map((m) => (
            <Text key={m} color={m === mode ? "white" : "gray"} dimColor={m !== mode}>
              {m}
            </Text>
          ))}
        </Box>
      </Box>
      <Box gap={2}>
        <Text color="gray" dimColor>{tokenCount.toLocaleString()} tkn</Text>
        <Box gap={1}>
          <Text color="gray" dimColor>[{effort}]</Text>
          <Text color={modelReady ? "green" : "yellow"}>
            {modelReady ? `● ${modelShort}` : "○ connecting..."}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
