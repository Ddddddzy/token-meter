// Fixed synthetic examples. Never fetch the real Token Meter API while filming.
export const records = [
  {agent: 'Codex', source: 'session usage', color: '#5592ee', input: 120000, output: 28320, x: 1110, y: 236, delay: 190},
  {agent: 'Claude Code', source: 'assistant usage', color: '#d89752', input: 60000, output: 8120, x: 1172, y: 456, delay: 204},
  {agent: 'opencode', source: 'message tokens', color: '#46aab0', input: 22000, output: 2160, x: 1050, y: 676, delay: 218},
] as const;
