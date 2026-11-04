import test from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../skills/ziw-ratchet/scripts/setup.mjs";
import {
  compareDecision,
  anchorDecision,
  stopReason,
} from "../skills/ziw-ratchet/scripts/decisions.mjs";
import { scoreSessions, currentSide, seededHash } from "../skills/ziw-ratchet/scripts/scoring.mjs";

for (const local of [false, true])
  test(`ratchet ${local ? "unit-targeted" : "sign-test"} null runs with agreeing judges bound false keeps`, (t) => {
    const setup = {
      criteria: ["a", "b", "c"].map((id) => ({ id, type: "judged", target: 6, weight: 1 })),
      thresholds: defaults,
      sets: { working: Array.from({ length: 8 }, (_, i) => `working${i}`) },
    };
    const capture = {
      gates: {},
      measurements: {},
      items: setup.sets.working.map((unit) => ({ id: unit, unit })),
    };
    let attempts = 0,
      keeps = 0,
      failures = 0,
      runsWithKeep = 0;
    const runs = 2000;
    function scores(run, round, family) {
      const sessions = [0, 1].map((judge) => {
        const pairs = ["working", "validation"].flatMap((set) =>
          Array.from({ length: 8 }, (_, item) => ({
            key: `${set}${item}`,
            item: `${set}${item}`,
            pair: `${set}${item}`,
            set,
            unit: `${set}${item}`,
            reference: "ref",
            currentSide: currentSide(run, family, `${set}${item}`, judge),
          })),
        );
        // Null with agreeing judges: both judges usually share one preference per
        // item, but that preference is as likely to favor last kept as current.
        // Half the items share it across every criterion.
        const coin = (...parts) =>
          parseInt(seededHash(run, parts.join(":"), "coin").slice(0, 8), 16) < 0x80000000;
        const verdicts = pairs.flatMap((p) =>
          setup.criteria.map((c) => {
            const shared = coin(round, family, p.key, "correlated") ? "all" : c.id;
            const follows =
              parseInt(
                seededHash(run, `${round}:${family}:${judge}`, `${p.key}:${c.id}`).slice(0, 8),
                16,
              ) <
              0.8 * 0x100000000;
            const prefersCurrent = follows
              ? coin(round, family, p.key, shared)
              : coin(round, family, judge, p.key, c.id, "noise");
            const other = p.currentSide === "A" ? "B" : "A";
            return {
              pair: p.pair,
              criterion: c.id,
              verdict: prefersCurrent ? p.currentSide : other,
            };
          }),
        );
        return { pairs, verdicts };
      });
      return scoreSessions(sessions, setup.criteria, defaults.confidence);
    }
    for (let run = 0; run < runs; run++) {
      let plateau = 0,
        kept = 0,
        rounds = 0;
      let standings = Object.fromEntries(
        setup.criteria.map((c) => [
          c.id,
          Object.fromEntries(
            ["working", "validation"].map((set) => [
              set,
              { standing: 5, lower: 2, count: 8, agreement: 1 },
            ]),
          ),
        ]),
      );
      while (
        !stopReason({ setup, standings, capture, plateau, rounds, cap: 25, recommendations: [{}] })
      ) {
        attempts++;
        rounds++;
        const comparison = scores(run, rounds, "cmp");
        const result = compareDecision(
          setup,
          ["a", "b", "c"],
          comparison,
          capture,
          capture,
          local ? ["working0"] : undefined,
        );
        if (result.failed) {
          failures++;
          break;
        }
        let keep = false;
        if (result.pass) {
          const reference = scores(run, rounds, "ref");
          const anchor = anchorDecision(setup, standings, reference);
          if (anchor.failed) {
            failures++;
            break;
          }
          if (anchor.pass) {
            keep = true;
            standings = reference;
          }
        }
        if (keep) {
          kept++;
          keeps++;
          plateau = 0;
        } else plateau++;
      }
      runsWithKeep += Number(kept > 0);
    }
    const perRound = keeps / attempts,
      perRun = runsWithKeep / runs;
    t.diagnostic(
      `null simulation ${local ? "unit-targeted" : "sign-test"}: ${runs} runs, ${attempts} rounds, ${keeps} keeps, ${failures} agreement failures; per-round=${perRound.toFixed(6)}, per-run=${perRun.toFixed(6)}`,
    );
    // Guard against a vacuous pass: null runs must reach the keep rule and plateau.
    assert.ok(attempts / runs >= 3, `mean rounds per run ${attempts / runs}`);
    assert.ok(failures / runs < 0.05, `agreement failures ${failures}`);
    assert.ok(perRound <= defaults.alpha, `per-round keep rate ${perRound}`);
    assert.ok(perRun <= 0.3, `per-run keep rate ${perRun}`);
  });
