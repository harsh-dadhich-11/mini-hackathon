import "server-only";

// The sudden-death questions: multiple choice, and only the right answer counts. Server-only so the correct letters
// never reach a public bundle; the Master console receives them through the signed-in /api/master overview.
// `correct: null` means a Master must fill in the options and the correct letter before that question can be used.

export type SuddenDeathQuestion = { key: string; question: string; options: string[]; correct: "A" | "B" | "C" | "D" | null; note: string };

export const SUDDEN_DEATH_BANK: SuddenDeathQuestion[] = [
  { key: "SD1", question: "In what year did Texas Instruments open its Bangalore centre, widely seen as India's first global capability centre?", options: ["1975", "1985", "1991", "1998"], correct: "B", note: "TI Bangalore opened in 1985." },
  { key: "SD2", question: "Roughly how many GCCs were operating in India in FY2024?", options: ["About 800", "About 1,200", "About 1,700", "About 2,500"], correct: "C", note: "Nasscom–Zinnov: about 1,700 GCCs in FY2024." },
  { key: "SD3", question: "In what year was BOT Consulting founded?", options: ["", "", "", ""], correct: null, note: "Fill in four years and pick the correct one before using this question." },
  { key: "SD4", question: "How tall is Mount Everest, in metres?", options: ["8,611 m", "8,849 m", "8,950 m", "9,120 m"], correct: "B", note: "8,848.86 m (2020 survey), usually given as 8,849 m. 8,611 m is K2." },
  { key: "SD5", question: "In what year was Nasscom founded?", options: ["1984", "1988", "1993", "1999"], correct: "B", note: "Nasscom was founded in 1988. A spare for a replay." },
  { key: "SD6", question: "In what year was Infosys founded?", options: ["1981", "1986", "1976", "1991"], correct: "A", note: "Infosys was founded in 1981. A spare for a replay." },
];
