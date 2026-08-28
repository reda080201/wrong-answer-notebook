export interface ParsedChoice { marker: string; content: string; }

export function parseChoice(choice: string): ParsedChoice {
  const match = choice.trim().match(/^(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|\(\d{1,2}\)|\d{1,2}\)|[A-Ea-e][.)])\s*(.*)$/);
  return match ? { marker: match[1], content: match[2] } : { marker: "", content: choice };
}
