import "./style.css";
import { getLeaderboard, publishRun, startRun, type Score } from "./api";
import { PhantasyGame, type GameOverSummary, type GameSnapshot } from "./game/game";
import { levelProgress } from "./game/progression";
import { masteryProgress, SIGNATURES } from "./game/combat";
import { dailySeed } from "./game/rng";
import type { UpgradeChoice, WeaponKind } from "./game/types";

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}`);
  return value as T;
}

const canvas = element<HTMLCanvasElement>("game-canvas");
const hud = element("hud");
const startScreen = element("start-screen");
const choiceScreen = element("choice-screen");
const sheetScreen = element("sheet-screen");
const gameOverScreen = element("game-over-screen");
const healthFill = element<HTMLElement>("health-fill");
const staminaFill = element<HTMLElement>("stamina-fill");
const xpFill = element<HTMLElement>("xp-fill");
const healthText = element("health-text");
const staminaText = element("stamina-text");
const levelText = element("level-text");
const regionName = element("region-name");
const weaponChip = element("weapon-chip");
const leaderboardList = element<HTMLOListElement>("leaderboard");
const scoreStatus = element("score-status");
const scoreForm = element<HTMLFormElement>("score-form");
const playerNameInput = element<HTMLInputElement>("player-name");
const soundButton = element<HTMLButtonElement>("sound-button");
const combatDock = element("combat-dock");
const evadeAction = element<HTMLButtonElement>("evade-action");
const signatureAction = element<HTMLButtonElement>("signature-action");
const evadeStatus = element("evade-status");
const signatureWeapon = element("signature-weapon");
const signatureName = element("signature-name");
const signatureStatus = element("signature-status");
const weaponNames: Record<WeaponKind, { glyph: string; label: string }> = {
  sword: { glyph: "⚔", label: "Sunblade" },
  spear: { glyph: "↟", label: "Thornlance" },
  wand: { glyph: "✦", label: "Starwand" },
};

let latestSnapshot: GameSnapshot | null = null;
let finalRun: GameOverSummary | null = null;
let offlineRun = false;

function showOnly(screen: HTMLElement | null): void {
  [startScreen, choiceScreen, sheetScreen, gameOverScreen].forEach((candidate) => {
    candidate.classList.toggle("hidden", candidate !== screen);
  });
}

function updateHud(snapshot: GameSnapshot): void {
  latestSnapshot = snapshot;
  const progress = levelProgress(snapshot.stats.totalXp);
  healthFill.style.width = `${Math.max(0, (snapshot.stats.health / snapshot.stats.maxHealth) * 100)}%`;
  staminaFill.style.width = `${Math.max(0, (snapshot.stats.stamina / snapshot.stats.maxStamina) * 100)}%`;
  xpFill.style.width = `${Math.min(100, (progress.current / progress.needed) * 100)}%`;
  healthText.textContent = `${Math.ceil(snapshot.stats.health)}/${snapshot.stats.maxHealth}`;
  staminaText.textContent = `${Math.ceil(snapshot.stats.stamina)}/${snapshot.stats.maxStamina}`;
  levelText.textContent = `LV ${snapshot.stats.level}`;
  regionName.textContent = snapshot.region;
  const weapon = weaponNames[snapshot.weapon];
  const weaponState = snapshot.weapons[snapshot.weapon];
  weaponChip.textContent = `${weapon.glyph} ${weapon.label} T${roman(weaponState.tier)} · M${weaponState.masteryLevel}`;
  const signature = SIGNATURES[snapshot.weapon];
  signatureWeapon.textContent = `${weapon.label} signature`;
  signatureName.textContent = signature.name;
  signatureStatus.textContent = snapshot.abilityCooldown <= 0 ? "Ready" : `${snapshot.abilityCooldown.toFixed(1)}s`;
  signatureAction.classList.toggle("cooling", snapshot.abilityCooldown > 0);
  evadeStatus.textContent = snapshot.dodgeCooldown <= 0 ? "Ready" : `${snapshot.dodgeCooldown.toFixed(1)}s`;
  evadeAction.classList.toggle("cooling", snapshot.dodgeCooldown > 0);
  (Object.keys(snapshot.weapons) as WeaponKind[]).forEach((kind) => {
    const mastery = masteryProgress(snapshot.weapons[kind].masteryXp);
    const label = document.querySelector<HTMLElement>(`[data-mastery="${kind}"]`);
    if (label) label.textContent = `Mastery ${mastery.level} · ${mastery.current}/${mastery.needed}`;
  });
}

function updateWeapon(kind: WeaponKind): void {
  document.querySelectorAll<HTMLButtonElement>(".weapon-option").forEach((button) => {
    button.classList.toggle("active", button.dataset.weapon === kind);
  });
}

function showLevelUp(level: number, choices: UpgradeChoice[]): void {
  element("level-up-title").textContent = `Level ${level}`;
  const cards = element("upgrade-cards");
  cards.replaceChildren();
  for (const choice of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `upgrade-card ${choice.rarity}`;
    const rarity = document.createElement("span");
    rarity.className = "rarity";
    rarity.textContent = choice.rarity;
    const icon = document.createElement("span");
    icon.className = "upgrade-icon";
    icon.textContent = choice.icon;
    const title = document.createElement("h3");
    title.textContent = choice.title;
    const description = document.createElement("p");
    description.textContent = choice.description;
    button.appendChild(rarity);
    button.appendChild(icon);
    button.appendChild(title);
    button.appendChild(description);
    button.addEventListener("click", () => {
      game.chooseUpgrade(choice);
      showOnly(null);
    });
    cards.appendChild(button);
  }
  showOnly(choiceScreen);
}

function showGameOver(summary: GameOverSummary): void {
  finalRun = summary;
  const minutes = Math.floor(summary.elapsedSeconds / 60);
  const seconds = summary.elapsedSeconds % 60;
  const runSummary = element("run-summary");
  runSummary.replaceChildren(
    summaryRune("Level", String(summary.stats.level)),
    summaryRune("Total XP", summary.stats.totalXp.toLocaleString()),
    summaryRune("Defeated", String(summary.defeated)),
    summaryRune("Time", `${minutes}:${String(seconds).padStart(2, "0")}`),
  );
  scoreStatus.textContent = offlineRun ? "Leaderboard service was offline for this run." : "";
  scoreForm.classList.toggle("hidden", offlineRun);
  showOnly(gameOverScreen);
  const rememberedName = localStorage.getItem("phantasy-codex-name");
  if (rememberedName) playerNameInput.value = rememberedName;
  window.setTimeout(() => playerNameInput.focus(), 100);
}

function summaryRune(label: string, value: string): HTMLElement {
  const container = document.createElement("div");
  container.className = "summary-rune";
  const small = document.createElement("small");
  small.textContent = label;
  const strong = document.createElement("b");
  strong.textContent = value;
  container.appendChild(small);
  container.appendChild(strong);
  return container;
}

function roman(value: number): string {
  const table = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return table[Math.min(table.length - 1, Math.max(0, value - 1))] ?? String(value);
}

const game = new PhantasyGame(canvas, {
  onStats: updateHud,
  onWeapon: updateWeapon,
  onLevelUp: showLevelUp,
  onGameOver: showGameOver,
});

async function beginRun(seed: number): Promise<void> {
  const pressedButton = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
  if (pressedButton) pressedButton.disabled = true;
  offlineRun = false;
  let sessionId = "";
  try {
    const session = await startRun(seed);
    sessionId = session.sessionId;
  } catch {
    offlineRun = true;
    sessionId = crypto.randomUUID();
  } finally {
    if (pressedButton) pressedButton.disabled = false;
  }
  hud.classList.remove("hidden");
  combatDock.classList.remove("hidden");
  showOnly(null);
  game.start(seed, sessionId);
}

element<HTMLButtonElement>("start-daily").addEventListener("click", () => void beginRun(dailySeed()));
element<HTMLButtonElement>("start-random").addEventListener("click", () => void beginRun(crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now()));
element<HTMLButtonElement>("play-again").addEventListener("click", () => {
  finalRun = null;
  game.resetToIdle();
  hud.classList.add("hidden");
  combatDock.classList.add("hidden");
  scoreForm.classList.remove("hidden");
  showOnly(startScreen);
});

document.querySelectorAll<HTMLButtonElement>(".weapon-option").forEach((button) => {
  button.addEventListener("click", () => game.setWeapon(button.dataset.weapon as WeaponKind));
});

evadeAction.addEventListener("click", () => game.queueAction("shift"));
signatureAction.addEventListener("click", () => game.queueAction("f"));

function renderCharacterSheet(): void {
  const snapshot = latestSnapshot;
  if (!snapshot) return;
  const target = element("character-sheet");
  target.replaceChildren();
  const statsBlock = document.createElement("section");
  statsBlock.className = "sheet-block";
  const statsHeading = document.createElement("h3");
  statsHeading.textContent = "Wanderer stats";
  const statGrid = document.createElement("div");
  statGrid.className = "stat-grid";
  const stats: Array<[string, string]> = [
    ["Level", String(snapshot.stats.level)],
    ["Total XP", snapshot.stats.totalXp.toLocaleString()],
    ["Health", `${Math.ceil(snapshot.stats.health)} / ${snapshot.stats.maxHealth}`],
    ["Stamina", `${Math.ceil(snapshot.stats.stamina)} / ${snapshot.stats.maxStamina}`],
    ["Power", String(snapshot.stats.power)],
    ["Armor", String(snapshot.stats.armor)],
    ["Speed", Math.round(snapshot.stats.speed).toString()],
    ["Luck", String(snapshot.stats.luck)],
  ];
  for (const [label, value] of stats) {
    const row = document.createElement("div");
    row.className = "stat";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("b");
    strong.textContent = value;
    row.appendChild(span);
    row.appendChild(strong);
    statGrid.appendChild(row);
  }
  statsBlock.appendChild(statsHeading);
  statsBlock.appendChild(statGrid);
  const relicBlock = document.createElement("section");
  relicBlock.className = "sheet-block";
  const relicHeading = document.createElement("h3");
  relicHeading.textContent = "Relic mastery";
  relicBlock.appendChild(relicHeading);
  (["sword", "spear", "wand"] as WeaponKind[]).forEach((kind) => {
    const state = snapshot.weapons[kind];
    const row = document.createElement("div");
    row.className = "relic-row";
    const glyph = document.createElement("span");
    glyph.textContent = weaponNames[kind].glyph;
    const name = document.createElement("span");
    name.textContent = weaponNames[kind].label;
    const detail = document.createElement("small");
    const mastery = masteryProgress(state.masteryXp);
    detail.textContent = `Temper ${roman(state.tier)} · Mastery ${mastery.level} (${mastery.current}/${mastery.needed}) · +${state.damageBonus} power`;
    row.appendChild(glyph);
    row.appendChild(name);
    row.appendChild(detail);
    relicBlock.appendChild(row);
  });
  target.appendChild(statsBlock);
  target.appendChild(relicBlock);
}

function toggleSheet(): void {
  const opened = game.toggleSheet();
  if (opened) {
    renderCharacterSheet();
    sheetScreen.classList.remove("hidden");
  } else sheetScreen.classList.add("hidden");
}

element<HTMLButtonElement>("sheet-button").addEventListener("click", toggleSheet);
element<HTMLButtonElement>("sheet-close").addEventListener("click", toggleSheet);
window.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    toggleSheet();
  }
  if (event.key.toLowerCase() === "m") toggleSound();
});

function toggleSound(): void {
  game.sound.setEnabled(!game.sound.isEnabled());
  soundButton.textContent = `Sound: ${game.sound.isEnabled() ? "on" : "off"}`;
}

soundButton.addEventListener("click", toggleSound);

scoreForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!finalRun) return;
  const submit = scoreForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  scoreStatus.textContent = "Writing your run into the shared Codex…";
  try {
    await publishRun({
      sessionId: finalRun.sessionId,
      playerName: playerNameInput.value,
      totalXp: finalRun.stats.totalXp,
      weapon: finalRun.weapon,
    });
    localStorage.setItem("phantasy-codex-name", playerNameInput.value.trim());
    scoreStatus.textContent = "Published! Your legend is now shared.";
    playerNameInput.disabled = true;
    if (submit) submit.textContent = "Published";
    await refreshLeaderboard();
  } catch (error) {
    scoreStatus.textContent = error instanceof Error ? error.message : "The Codex could not record this run.";
    if (submit) submit.disabled = false;
  }
});

async function refreshLeaderboard(): Promise<void> {
  leaderboardList.replaceChildren(emptyScore("The pages are turning…"));
  try {
    const scores = await getLeaderboard();
    renderScores(scores);
  } catch {
    leaderboardList.replaceChildren(emptyScore("Shared scores appear when the hosted Codex is online."));
  }
}

function emptyScore(message: string): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "empty-score";
  item.textContent = message;
  return item;
}

function renderScores(scores: Score[]): void {
  leaderboardList.replaceChildren();
  if (scores.length === 0) {
    leaderboardList.appendChild(emptyScore("No legends yet. Claim the first page."));
    return;
  }
  for (const score of scores.slice(0, 10)) {
    const item = document.createElement("li");
    item.className = "score-row";
    const name = document.createElement("div");
    name.className = "score-name";
    const strong = document.createElement("b");
    strong.textContent = score.playerName;
    const small = document.createElement("small");
    small.textContent = `Lv ${score.level} · ${weaponNames[score.weapon]?.label ?? score.weapon}`;
    name.appendChild(strong);
    name.appendChild(small);
    const xp = document.createElement("span");
    xp.className = "score-xp";
    xp.textContent = `${score.totalXp.toLocaleString()} XP`;
    item.appendChild(name);
    item.appendChild(xp);
    leaderboardList.appendChild(item);
  }
}

element<HTMLButtonElement>("refresh-scores").addEventListener("click", () => void refreshLeaderboard());
void refreshLeaderboard();
