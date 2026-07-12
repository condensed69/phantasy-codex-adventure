import type { WeaponKind } from "./game/types";

export interface Score {
  rank: number;
  id: string;
  playerName: string;
  level: number;
  totalXp: number;
  weapon: WeaponKind;
  seed: number;
  durationSeconds: number;
  submittedAt: number;
}

export interface RunSession {
  sessionId: string;
  seed: number;
  startedAt: number;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}

export function startRun(seed: number): Promise<RunSession> {
  return requestJson<RunSession>("/api/runs/start", { method: "POST", body: JSON.stringify({ seed }) });
}

export function publishRun(data: {
  sessionId: string;
  playerName: string;
  totalXp: number;
  weapon: WeaponKind;
}): Promise<Score> {
  return requestJson<Score>("/api/runs/end", { method: "POST", body: JSON.stringify(data) });
}

export async function getLeaderboard(): Promise<Score[]> {
  const data = await requestJson<{ scores: Score[] }>("/api/leaderboard", { headers: { accept: "application/json" } });
  return data.scores;
}
