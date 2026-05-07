import React from "react";
import { Box, Text } from "ink";

interface Props {
  sessionName: string;
  tokenCount: number;
  paperCount: number;
  model: string;
  effort: string;
}

export function Sidebar({ sessionName, tokenCount, paperCount, model, effort }: Props) {
  const modelShort = model.split("/").pop() ?? model;
  const pct = Math.min(100, Math.round((tokenCount / 32768) * 100));
  return (
    <Box flexDirection="column" width={24} gap={1}>
      <Text bold color="white" dimColor>{sessionName.toUpperCase()}</Text>

      <Box flexDirection="column">
        <Text color="gray" dimColor>Context</Text>
        <Text color="gray">{tokenCount.toLocaleString()} tokens ({pct}%)</Text>
      </Box>

      <Box flexDirection="column">
        <Text color="gray" dimColor>Papers</Text>
        <Text color="gray">{paperCount} saved</Text>
      </Box>

      <Box flexDirection="column">
        <Text color="gray" dimColor>Model</Text>
        <Text color="cyan" wrap="truncate-end">{modelShort}</Text>
        <Text color="gray" dimColor>effort: {effort}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color="gray" dimColor italic>Commands</Text>
        <Text color="gray" dimColor> /read</Text>
        <Text color="gray" dimColor> /search</Text>
        <Text color="gray" dimColor> /research</Text>
        <Text color="gray" dimColor> /synthesize</Text>
        <Text color="gray" dimColor> /graph</Text>
        <Text color="gray" dimColor> /papers</Text>
        <Text color="gray" dimColor> /skills</Text>
        <Text color="gray" dimColor> /personas</Text>
        <Text color="gray" dimColor> /clear</Text>
        <Text color="gray" dimColor> /mode</Text>
        <Text color="gray" dimColor> /model</Text>
        <Text color="gray" dimColor> /effort</Text>
      </Box>
    </Box>
  );
}
