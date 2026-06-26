/**
 * Testes da lógica pura de gamificação (Grow Score, níveis, badges).
 * Sem banco — funções puras. Ver GAMIFICATION-STUDY.md.
 */
import { describe, it, expect } from "vitest";
import {
  computeGrowScore,
  computeLevel,
  computeBadges,
  computeProgress,
  computeStreak,
  SCORE_WEIGHTS,
} from "./lib/gamification";

const empty = { logCount: 0, photoCount: 0, trichomeCount: 0, finishedCycles: 0, plantCount: 0, currentStreak: 0 };

describe("computeGrowScore", () => {
  it("zero sem atividade", () => {
    expect(computeGrowScore(empty)).toBe(0);
  });

  it("soma os pesos por tipo de ação", () => {
    const s = { ...empty, logCount: 3, photoCount: 2, trichomeCount: 1, finishedCycles: 1 };
    const expected = 3 * SCORE_WEIGHTS.log + 2 * SCORE_WEIGHTS.photo + 1 * SCORE_WEIGHTS.trichome + 1 * SCORE_WEIGHTS.finishedCycle;
    expect(computeGrowScore(s)).toBe(expected);
  });

  it("ciclo finalizado vale muito mais que um log", () => {
    expect(SCORE_WEIGHTS.finishedCycle).toBeGreaterThan(SCORE_WEIGHTS.log * 10);
  });
});

describe("computeLevel", () => {
  it("nível 1 (Brotinho) em score 0", () => {
    const l = computeLevel(0);
    expect(l.num).toBe(1);
    expect(l.name).toBe("Brotinho");
    expect(l.nextAt).toBe(100);
  });

  it("sobe de nível no limiar", () => {
    expect(computeLevel(99).name).toBe("Brotinho");
    expect(computeLevel(100).name).toBe("Muda");
    expect(computeLevel(400).name).toBe("Cultivador");
    expect(computeLevel(1000).name).toBe("Grower");
  });

  it("progressPct entre níveis", () => {
    // score 250: nível Muda (100-400), 150/300 = 50%
    expect(computeLevel(250).progressPct).toBe(50);
  });

  it("nível máximo → progressPct 100 e sem próximo", () => {
    const l = computeLevel(99999);
    expect(l.name).toBe("Lenda");
    expect(l.nextAt).toBeNull();
    expect(l.progressPct).toBe(100);
  });
});

describe("computeBadges", () => {
  it("nenhum desbloqueado sem atividade", () => {
    const badges = computeBadges(empty);
    expect(badges.every((b) => !b.unlocked)).toBe(true);
    expect(badges).toHaveLength(8);
  });

  it("desbloqueia primeiro registro + planta", () => {
    const badges = computeBadges({ ...empty, logCount: 1, plantCount: 1 });
    expect(badges.find((b) => b.id === "first-log")?.unlocked).toBe(true);
    expect(badges.find((b) => b.id === "first-plant")?.unlocked).toBe(true);
  });

  it("badges de ofensiva por limiar + progresso", () => {
    const badges = computeBadges({ ...empty, currentStreak: 12 });
    expect(badges.find((b) => b.id === "streak-7")?.unlocked).toBe(true);
    const dedicado = badges.find((b) => b.id === "streak-30");
    expect(dedicado?.unlocked).toBe(false);
    expect(dedicado?.progress).toEqual({ have: 12, need: 30 });
  });

  it("progresso é clampado ao alvo quando desbloqueado", () => {
    const badges = computeBadges({ ...empty, photoCount: 25 });
    expect(badges.find((b) => b.id === "photographer")?.progress).toEqual({ have: 10, need: 10 });
  });
});

describe("computeStreak", () => {
  const now = new Date("2026-06-26T15:00:00Z");

  it("vazio sem dias", () => {
    expect(computeStreak([], now)).toEqual({ current: 0, longest: 0, todayDone: false });
  });

  it("conta dias consecutivos terminando hoje", () => {
    const days = ["2026-06-24", "2026-06-25", "2026-06-26"];
    const r = computeStreak(days, now);
    expect(r.current).toBe(3);
    expect(r.todayDone).toBe(true);
  });

  it("tolera 'ainda não registrou hoje' (conta até ontem)", () => {
    const days = ["2026-06-24", "2026-06-25"]; // hoje (26) ausente
    const r = computeStreak(days, now);
    expect(r.current).toBe(2);
    expect(r.todayDone).toBe(false);
  });

  it("quebra a ofensiva com buraco", () => {
    const days = ["2026-06-20", "2026-06-25", "2026-06-26"]; // buraco antes do 25
    const r = computeStreak(days, now);
    expect(r.current).toBe(2);
    expect(r.longest).toBe(2);
  });

  it("longest pega a maior sequência histórica", () => {
    const days = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-26"];
    expect(computeStreak(days, now).longest).toBe(4);
  });
});

describe("computeProgress", () => {
  it("agrega score + nível + contagem de badges", () => {
    const p = computeProgress({ ...empty, logCount: 10, plantCount: 1, currentStreak: 7 });
    expect(p.growScore).toBe(100);
    expect(p.level.name).toBe("Muda");
    expect(p.badgesTotal).toBe(8);
    // first-log, first-plant, streak-7 = 3
    expect(p.badgesUnlocked).toBe(3);
  });
});
