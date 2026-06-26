/**
 * Testes da lógica pura de gamificação (Grow Score, níveis, badges).
 * Sem banco — funções puras. Ver GAMIFICATION-STUDY.md.
 */
import { describe, it, expect } from "vitest";
import {
  computeGrowScore,
  computeLevel,
  computeAchievements,
  computePlatinum,
  computeProgress,
  computeStreak,
  SCORE_WEIGHTS,
} from "./lib/gamification";

const empty = { logCount: 0, photoCount: 0, trichomeCount: 0, finishedCycles: 0, plantCount: 0, currentStreak: 0, longestStreak: 0 };

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

describe("computeAchievements", () => {
  const find = (s: any, key: string) => computeAchievements(s).find((a) => a.key === key);

  it("tudo bloqueado sem atividade", () => {
    const a = computeAchievements(empty);
    expect(a.every((x) => !x.unlocked)).toBe(true);
    expect(a).toHaveLength(9); // 6 escaláveis + 3 marcos (Fase 0)
  });

  it("marcos desbloqueiam no primeiro registro/planta", () => {
    expect(find({ ...empty, logCount: 1 }, "primeiro-broto")?.tier).toBe("bronze");
    expect(find({ ...empty, plantCount: 1 }, "germinacao")?.tier).toBe("bronze");
  });

  it("conquista escalável sobe de tier pelo limiar", () => {
    expect(find({ ...empty, currentStreak: 6 }, "mao-na-terra")?.tier).toBeNull();
    expect(find({ ...empty, currentStreak: 7 }, "mao-na-terra")?.tier).toBe("bronze");
    expect(find({ ...empty, currentStreak: 30 }, "mao-na-terra")?.tier).toBe("silver");
    expect(find({ ...empty, currentStreak: 100 }, "mao-na-terra")?.tier).toBe("gold");
  });

  it("nextThreshold aponta o próximo alvo", () => {
    const a = find({ ...empty, currentStreak: 12 }, "mao-na-terra");
    expect(a?.tier).toBe("bronze");
    expect(a?.nextThreshold).toBe(30);
  });
});

describe("computePlatinum", () => {
  it("não desbloqueada sem nada; total = 21 tiers (6×3 + 3)", () => {
    const p = computePlatinum(computeAchievements(empty));
    expect(p.unlocked).toBe(false);
    expect(p.have).toBe(0);
    expect(p.total).toBe(21);
  });

  it("desbloqueada com tudo no topo (ciclo basta prata)", () => {
    const maxed = {
      logCount: 500, photoCount: 200, trichomeCount: 100, finishedCycles: 5,
      plantCount: 1, currentStreak: 100, longestStreak: 180,
    };
    const p = computePlatinum(computeAchievements(maxed));
    expect(p.unlocked).toBe(true);
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
  it("agrega score + nível + achievements + platina", () => {
    const p = computeProgress({ ...empty, logCount: 10, plantCount: 1, currentStreak: 7 });
    expect(p.growScore).toBe(100);
    expect(p.level.name).toBe("Muda");
    expect(p.achievements).toHaveLength(9);
    // mao-na-terra, diario-de-bordo, primeiro-broto, germinacao = 4 desbloqueados
    expect(p.achievements.filter((a) => a.unlocked)).toHaveLength(4);
    expect(p.platinum.unlocked).toBe(false);
    expect(p.platinum.total).toBe(21);
  });
});
