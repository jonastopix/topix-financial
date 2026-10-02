import { describe, expect, it } from "vitest";
import { interpoler, type Knaek } from "@/lib/boardroomScore/kurve";

const K: Knaek = [[0, 0], [1, 50], [3, 150], [6, 225], [9, 250]];

describe("interpoler — stykkevis lineær, mættet", () => {
  it("rammer knækkene præcist", () => {
    for (const [x, y] of K) expect(interpoler(K, x)).toBe(y);
  });
  it("interpolerer lineært mellem to knæk: 2 måneder = 50 + (2−1)/(3−1) × (150−50) = 100", () => {
    expect(interpoler(K, 2)).toBe(100);
    expect(interpoler(K, 4.5)).toBe(187.5);
  });
  it("mætter i begge ender — outliers kan ikke vælte scoren", () => {
    expect(interpoler(K, -1_000)).toBe(0);
    expect(interpoler(K, 10_000)).toBe(250);
  });
  it("NaN og ±∞ giver første knæk, aldrig NaN", () => {
    expect(interpoler(K, Number.NaN)).toBe(0);
    expect(interpoler(K, Number.POSITIVE_INFINITY)).toBe(0);
    expect(interpoler(K, Number.NEGATIVE_INFINITY)).toBe(0);
  });
  it("tomt knæksæt giver 0", () => {
    expect(interpoler([], 5)).toBe(0);
  });
  it("negative x-knæk (margin −20 %) virker", () => {
    const M: Knaek = [[-0.2, 0], [0, 100], [0.2, 250]];
    expect(interpoler(M, -0.1)).toBe(50);
    expect(interpoler(M, 0.1)).toBe(175);
  });
});
