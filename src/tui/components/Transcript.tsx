import React from "react";
import { Box, Text } from "ink";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
}

interface Props {
  messages: Message[];
  streaming?: string;
  busy?: boolean;
}

function MarkdownTable({ raw }: { raw: string }) {
  const lines = raw.trim().split("\n");
  const rows = lines
    .filter(l => l.includes("|") && !l.includes("---")) // Filter out separator rows
    .map(l => l.split("|").filter(c => c.trim().length > 0 || l.indexOf(c) > 0 && l.indexOf(c) < l.lastIndexOf("|")).map(c => c.trim()));

  if (rows.length === 0) return <Text>{raw}</Text>;

  // Calculate column widths
  const colWidths: number[] = [];
  rows.forEach(row => {
    row.forEach((cell, i) => {
      colWidths[i] = Math.max(colWidths[i] || 0, cell.length);
    });
  });

  return (
    <Box flexDirection="column" marginY={1} paddingX={1}>
      {rows.map((row, rowIndex) => (
        <Box key={rowIndex} gap={2} borderStyle={rowIndex === 0 ? "single" : undefined} borderTop={false} borderLeft={false} borderRight={false} borderColor="gray">
          {row.map((cell, colIndex) => (
            <Box key={colIndex} width={(colWidths[colIndex] || 0) + 2}>
              <Text bold={rowIndex === 0} color={rowIndex === 0 ? "cyan" : "white"} dimColor={rowIndex !== 0}>
                {cell}
              </Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

function ContentRenderer({ content }: { content: string }) {
  // Split content by potential table blocks
  // A table usually starts with | and ends with |
  const parts = content.split(/(\n\|[\s\S]+?\|\n)/g);

  return (
    <Box flexDirection="column">
      {parts.map((part, i) => {
        if (part.trim().startsWith("|") && part.trim().endsWith("|") && part.includes("---")) {
          return <MarkdownTable key={i} raw={part} />;
        }
        return <Text key={i} wrap="wrap">{part}</Text>;
      })}
    </Box>
  );
}

function MessageBlock({ msg, streaming }: { msg?: Message; streaming?: string }) {
  const isUser = msg ? msg.role === "user" : false;
  const content = msg ? msg.content : (streaming ?? "");
  const thinking = msg?.thinking;

  return (
    <Box flexDirection="column" marginBottom={msg ? 1 : 0}>
      {thinking && (
        <Box paddingLeft={2} marginBottom={0}>
          <Text color="gray" italic dimColor>⟪ {thinking} ⟫</Text>
        </Box>
      )}
      <Box>
        <Box width={2} flexShrink={0}>
          <Text color={isUser ? "cyan" : "green"}>{isUser ? "▎" : "▌"}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <Box>
            <Text color="gray" dimColor>{isUser ? "you " : "jax "}</Text>
            <ContentRenderer content={content} />
          </Box>
          {!msg && <Text color="green"> ▋</Text>}
        </Box>
      </Box>
    </Box>
  );
}

export function Transcript({ messages, streaming, busy }: Props) {
  const visible = messages.filter((m) => m.role !== "system");
  return (
    <Box flexDirection="column" flexGrow={1} overflowY="hidden">
      {visible.map((m, i) => (
        <MessageBlock key={`msg-${i}`} msg={m} />
      ))}
      {(streaming !== undefined || busy) && (
        <MessageBlock streaming={streaming} />
      )}
    </Box>
  );
}
