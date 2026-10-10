// Synthetic, deterministic examples; no real account data is used.
export const demo = {
  daily: [148320, 68120, 24160],
  weekly: [715000, 328000, 114020],
  weekBins: [148320, 181400, 92480, 220000, 140320, 133900, 240600],
  hourlyWeights: [0,0,0,0,0,0,0,0,2,7,6,5,3,4,8,10,7,4,6,5,9,7,4,3],
  codex: {input: 120000, cached: 72000, output: 28320, reasoning: 16320},
  agents: ['Codex', 'Claude Code', 'opencode'],
  models: ['gpt-6.1-sol', 'claude-sonnet', '示例模型'],
  colors: ['#5592ee', '#d89752', '#46aab0'],
};
export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
export const full = (value: number) => Math.round(value).toLocaleString('en-US');
