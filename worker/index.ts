import { isPlausibleRun, validateRunSubmission } from "./validation";

interface SessionRow {
  id: string;
  seed: number;
  started_at: number;
  consumed_at: number | null;
}

interface LeaderboardRow {
  id: string;
  player_name: string;
  level: number;
  total_xp: number;
  weapon: string;
  seed: number;
  duration_seconds: number;
  submitted_at: number;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
} as const;

function json(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function parseSeed(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return Math.floor(Date.now() / 86_400_000);
  return Math.max(0, Math.min(0xffff_ffff, value));
}

async function startRun(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { seed?: unknown };
  const sessionId = crypto.randomUUID();
  const seed = parseSeed(body.seed);
  const startedAt = Date.now();

  await env.DB.prepare("INSERT INTO run_sessions (id, seed, started_at) VALUES (?, ?, ?)")
    .bind(sessionId, seed, startedAt)
    .run();

  ctx.waitUntil(
    env.DB.prepare("DELETE FROM run_sessions WHERE started_at < ?")
      .bind(startedAt - 86_400_000)
      .run()
      .then(() => undefined),
  );

  return json({ sessionId, seed, startedAt }, 201);
}

async function endRun(request: Request, env: Env): Promise<Response> {
  let run;
  try {
    run = validateRunSubmission(await request.json());
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid run." }, 400);
  }

  const session = await env.DB.prepare(
    "SELECT id, seed, started_at, consumed_at FROM run_sessions WHERE id = ?",
  )
    .bind(run.sessionId)
    .first<SessionRow>();

  if (!session) return json({ error: "This run session does not exist." }, 404);
  if (session.consumed_at !== null) return json({ error: "This run was already published." }, 409);

  const finishedAt = Date.now();
  const durationSeconds = Math.max(0, Math.floor((finishedAt - session.started_at) / 1000));
  if (!isPlausibleRun(run.totalXp, durationSeconds)) {
    return json({ error: "The run did not pass score validation." }, 422);
  }

  const scoreId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("UPDATE run_sessions SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(
      finishedAt,
      session.id,
    ),
    env.DB.prepare(
      `INSERT INTO leaderboard_runs
       (id, player_name, level, total_xp, weapon, seed, duration_seconds, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      scoreId,
      run.playerName,
      run.level,
      run.totalXp,
      run.weapon,
      session.seed,
      durationSeconds,
      finishedAt,
    ),
  ]);

  return json({
    id: scoreId,
    playerName: run.playerName,
    level: run.level,
    totalXp: run.totalXp,
    weapon: run.weapon,
    durationSeconds,
  }, 201);
}

async function leaderboard(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT id, player_name, level, total_xp, weapon, seed, duration_seconds, submitted_at
     FROM leaderboard_runs
     ORDER BY total_xp DESC, level DESC, duration_seconds ASC, submitted_at ASC
     LIMIT 20`,
  ).all<LeaderboardRow>();

  const scores = result.results.map((row, index) => ({
    rank: index + 1,
    id: row.id,
    playerName: row.player_name,
    level: row.level,
    totalXp: row.total_xp,
    weapon: row.weapon,
    seed: row.seed,
    durationSeconds: row.duration_seconds,
    submittedAt: row.submitted_at,
  }));

  return json({ scores }, 200, { "cache-control": "public, max-age=15" });
}

async function handleApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({ ok: true, service: "phantasy-codex-adventure" });
  }
  if (request.method === "GET" && url.pathname === "/api/leaderboard") return leaderboard(env);
  if (request.method === "POST" && url.pathname === "/api/runs/start") return startRun(request, env, ctx);
  if (request.method === "POST" && url.pathname === "/api/runs/end") return endRun(request, env);

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, ctx);
      return await env.ASSETS.fetch(request);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "request_error",
          path: url.pathname,
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
      return json({ error: "The Codex is momentarily clouded. Try again." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
