#!/usr/bin/env python3
"""Reproduce CampMind's small supervised policy. Requires Python and NumPy only.

This is a task-specific neural policy, not a language model. Its supervision is
the exact utility teacher also implemented in src/games/camp/ai/teacher.ts. Held-out
agreement measures imitation of that teacher, not intelligence or win rate.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import time

# Fixed BLAS threading also avoids oversubscribing a developer's machine.
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
import numpy as np


FEATURE_NAMES = [
    "hunger", "energy", "health", "morale", "fear", "trust", "bravery", "diligence", "empathy",
    "wood", "food", "fire", "danger", "time", "rainIntensity", "windStrength", "injured", "allyHealth", "alliesNeedHelp",
    "woodWorkers", "foodWorkers", "fireWorkers", "helpWorkers", "commandWood", "commandFood", "commandFire",
    "commandEat", "commandRest", "commandHelp", "commandCamp", "commandExplore", "priorityWood", "priorityFood",
    "distanceToCamp", "carriedWood", "carriedFood", "stormRisk", "wetness", "exposure", "shelterIntegrity", "shelterDistance",
    "foodReserveRatio", "projectedFoodRatio", "foodDispatchNeeded",
]
ACTIONS = ["wood", "food", "fire", "eat", "rest", "help", "camp", "explore"]
EMOTIONS = ["calm", "happy", "worried", "annoyed", "caring"]
TENSOR_NAMES = ["hidden1.weight", "hidden1.bias", "hidden2.weight", "hidden2.bias", "action.weight", "action.bias", "emotion.weight", "emotion.bias"]


def teacher(f: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    hunger, energy, health, morale, fear, trust, bravery, diligence, empathy = f[:, :9].T
    wood, food, fire, danger, progress, rain, wind, injured, ally_health, needs = f[:, 9:19].T
    wood_workers, food_workers, fire_workers, help_workers = f[:, 19:23].T
    fatigue = 1 - energy
    hungry = np.maximum(0, hunger - 0.35)
    risk = np.minimum(1.5, danger * (1.15 - 0.55 * bravery) + 0.65 * fear * (1 - 0.4 * bravery))
    late = np.clip((progress - 0.84) / 0.12, 0, 1)
    weather = np.maximum(rain, wind)
    storm_risk, wetness, exposure, shelter_integrity, shelter_distance = f[:, 36:41].T
    weather_risk = (0.65 * rain + 0.35 * wind + 1.2 * storm_risk) * (1.1 - 0.6 * bravery)
    exposure_stress = weather_risk * (0.55 + 0.45 * exposure)
    shelter_need = ((3.8 * exposure_stress + 4.2 * wetness) * (0.3 + 0.7 * shelter_integrity)
                    - 1.1 * shelter_distance * weather - 4 * np.maximum(0, hunger - 0.65))
    command_strength = 3.4 + 2 * trust + 1.2 * diligence - 2.5 * np.maximum(0, fatigue - 0.5) - 1.3 * fear
    action = np.stack([
        0.8 + 2.5 * (1 - wood) + 1.1 * diligence + 1.8 * f[:, 31]
        + 1.2 * (1 - fire) * (1 - wood) - 2.8 * hungry - 3.5 * fatigue
        - 4 * risk - 1.2 * injured - 1.8 * wood_workers - 9 * late - 1.5 * weather_risk - 0.7 * wetness,
        0.9 + 3.5 * (1 - food) + diligence + 1.8 * f[:, 32]
        - 2 * hungry - 3 * fatigue - 3.6 * risk - injured - 1.8 * food_workers - 9 * late
        - 1.3 * weather_risk - 0.7 * wetness,
        1 + 6 * (1 - fire) * (0.55 + 0.45 * progress) + 0.9 * weather + 0.3 * diligence
        - 1.3 * hungry - 1.3 * fatigue - 0.6 * risk - 2 * fire_workers
        + 1.2 * weather * (1 - fire) + 0.9 * storm_risk * bravery * (1 - fire) - 0.8 * exposure_stress,
        -1 + 11 * hungry + 1.5 * (1 - health) + 0.5 * food,
        -0.2 + 8.5 * np.maximum(0, 0.65 - energy) + 3.5 * (1 - health)
        + 1.5 * injured + np.maximum(0, 0.4 - morale) - 0.3 * hunger + shelter_need,
        -0.8 + 4.5 * needs + 3.8 * (1 - ally_health) + 2.3 * empathy
        - 2 * fatigue - 2 * risk - hungry - 2.2 * help_workers - injured - 0.8 * exposure_stress,
        -0.7 + 8.5 * risk + 1.4 * f[:, 33] + 2 * injured * danger
        + 1.8 * f[:, 34] + 1.5 * f[:, 35] + late * (3 + 12 * f[:, 33])
        + 0.7 * exposure_stress + 2.8 * wetness * (1 - shelter_integrity) * fire,
        0.4 + 2.4 * bravery + energy + 1.1 * (1 - progress) + 1.8 * np.minimum(wood, food)
        + 0.6 * morale + 0.2 * trust - 4 * risk - 3 * fatigue - 2 * hungry - 1.2 * injured - 9 * late
        - 2.4 * weather_risk - wetness,
    ], axis=1)
    action += f[:, 23:31] * command_strength[:, None]
    survival = (f[:, 43] > .5) & (energy >= .45) & (health > .35) & (injured < .5)
    food_action = np.where((hunger >= .55) & (food >= 1 / 15), 3, 1)
    rows = np.where(survival)[0]
    action[rows, food_action[rows]] = action.max(axis=1)[rows] + 6 + 4 * (1 - f[rows, 41])
    command_present = np.minimum(1, f[:, 23:31].sum(axis=1))
    emotion = np.stack([
        1.8 + 0.6 * morale - 0.7 * danger - fear - 0.6 * hunger - 0.6 * fatigue - 0.3 * exposure_stress,
        -0.5 + 2.6 * morale + 1.2 * trust + 0.6 * food + 0.4 * fire
        - 1.6 * hunger - 1.4 * fatigue - 2 * danger - fear - 0.6 * exposure_stress - 0.4 * wetness,
        -0.7 + 3.4 * risk + 2 * np.maximum(0, hunger - 0.55)
        + 2.3 * np.maximum(0, 0.55 - health) + 1.6 * injured + 0.8 * (1 - fire) * late
        + 0.4 * weather + 1.4 * exposure_stress + 0.8 * wetness,
        -0.4 + 1.4 * np.maximum(0, 0.45 - trust) + 1.4 * np.maximum(0, 0.4 - morale)
        + command_present * (1 + 1.9 * np.maximum(0, 0.5 - trust)
          + 1.6 * np.maximum(0, fatigue - 0.4) + 1.7 * np.maximum(0, hunger - 0.55)),
        -0.7 + 2.2 * needs + 1.8 * empathy + 1.2 * (1 - ally_health)
        - 0.8 * hunger - fatigue - 1.4 * risk - 0.8 * injured,
    ], axis=1)
    return action.astype(np.float32), emotion.astype(np.float32)


def legal_masks(f: np.ndarray) -> np.ndarray:
    """Plausible training masks; the game supplies its authoritative mask at runtime."""
    mask = np.ones((len(f), len(ACTIONS)), dtype=bool)
    mask[:, 0] = (f[:, 19] < 1) & (f[:, 2] > 0.35) & (f[:, 1] >= 0.45) & (f[:, 16] < .5)
    mask[:, 1] = (f[:, 2] > 0.35) & (f[:, 1] >= 0.45) & (f[:, 16] < .5)
    mask[:, 2] = False  # Fire is cosmetic in the persistent village.
    mask[:, 3] = (f[:, 10] >= 1 / 15) & (f[:, 0] >= 0.08)
    mask[:, 5] = (f[:, 18] > 0) & (f[:, 22] < 0.5)
    mask[:, 7] = (f[:, 1] >= 0.55) & (f[:, 2] > 0.45) & (f[:, 16] < .5)
    carrying = (f[:, 34] > 0) | (f[:, 35] > 0)
    mask[carrying] = False
    mask[carrying, 4] = True
    mask[carrying, 6] = True
    return mask


def generate_states(count: int, seed: int, shifted: bool = False) -> np.ndarray:
    rng = np.random.default_rng(seed)
    f = np.zeros((count, len(FEATURE_NAMES)), dtype=np.float32)
    f[:, 0] = rng.beta(2.1, 2.8, count)
    f[:, 1] = rng.beta(3, 1.8, count)
    f[:, 2] = rng.beta(7, 1, count)
    f[:, 3] = rng.beta(4, 2, count)
    f[:, 4] = rng.beta(1, 5, count)
    f[:, 5] = rng.beta(4, 2, count)
    archetypes = np.array([[.9, .82, .4], [.27, .78, .65], [.56, .24, .26], [.68, .12, .2], [.77, .47, .49],
                          [.74, .96, .38], [.52, .76, .98], [.22, .32, .56], [.46, .9, .32]])
    f[:, 6:9] = archetypes[rng.integers(0, len(archetypes), count)] + rng.normal(0, 0.1, (count, 3))
    f[:, 9] = rng.integers(0, 31, count) / 30
    f[:, 10] = rng.integers(0, 16, count) / 15
    f[:, 11] = rng.beta(3, 1.5, count)
    f[:, 12] = rng.beta(1, 5, count)
    f[:, 13] = rng.uniform(0, 1, count)
    weather = rng.choice(4, count, p=[0.42, 0.22, 0.16, 0.20])
    f[:, 14] = np.where(weather == 1, rng.uniform(0.25, 0.85, count),
                        np.where(weather == 3, rng.uniform(0.6, 1, count), 0))
    f[:, 15] = np.where(weather == 0, rng.uniform(0.02, 0.18, count),
                        np.where(weather == 1, rng.uniform(0.15, 0.55, count), rng.uniform(0.55, 1, count)))
    f[:, 16] = rng.random(count) < 0.07
    ally_health = rng.beta(6, 1.5, (count, 2))
    ally_injured = rng.random((count, 2)) < 0.08
    f[:, 17] = ally_health.min(axis=1)
    f[:, 18] = ((ally_health < 0.65) | ally_injured).sum(axis=1) / 2
    other_jobs = rng.integers(0, 8, (count, 2))
    for column, action in zip(range(19, 23), [0, 1, 2, 5]):
        f[:, column] = (other_jobs == action).sum(axis=1) / 2
    has_command = rng.random(count) < 0.35
    commands = rng.integers(0, 8, count)
    f[np.arange(count)[has_command], 23 + commands[has_command]] = 1
    priorities = rng.choice(3, count, p=[0.5, 0.25, 0.25])
    f[:, 31] = priorities == 1
    f[:, 32] = priorities == 2
    f[:, 33] = np.where(rng.random(count) < 0.3, 1, rng.uniform(0, 1, count))
    f[:, 34] = np.where(rng.random(count) < 0.1, rng.integers(1, 7, count) / 6, 0)
    f[:, 35] = np.where(rng.random(count) < 0.1, rng.integers(1, 5, count) / 4, 0)
    f[:, 36] = np.where(weather == 3, rng.uniform(0.55, 1, count),
                        np.where(weather == 1, rng.uniform(0, 0.2, count), 0))
    f[:, 39] = np.where(rng.random(count) < 0.12, rng.uniform(0.05, 0.5, count), rng.uniform(0.55, 1, count))
    under_cover = rng.random(count) < 0.35
    f[:, 38] = np.where(under_cover, 1 - 0.96 * f[:, 39], 1)
    f[:, 40] = np.where(under_cover, 0, rng.uniform(0.03, 0.7, count))
    f[:, 33] = np.where(under_cover, rng.uniform(0.3, 1, count), f[:, 33])
    # Residual wetness can persist after rain or after reaching cover.
    f[:, 37] = np.where(rng.random(count) < 0.2, rng.uniform(0, 1, count),
                        rng.uniform(0, 1, count) * f[:, 14] * (0.2 + 0.8 * f[:, 38]))

    # Explicit profiles prevent critical but infrequent states being omitted.
    profile = rng.integers(0, 14, count)
    def set_uniform(group: int, column: int, low: float, high: float) -> None:
        chosen = profile == group
        f[chosen, column] = rng.uniform(low, high, chosen.sum())
    set_uniform(1, 0, 0.78, 1)
    set_uniform(2, 1, 0.01, 0.23)
    set_uniform(3, 12, 0.55, 1)
    set_uniform(3, 4, 0.45, 1)
    set_uniform(4, 11, 0.01, 0.22)
    set_uniform(4, 14, 0.55, 0.95)
    set_uniform(4, 15, 0.25, 0.65)
    set_uniform(4, 36, 0, 0.2)
    chosen = profile == 5
    f[chosen, 23:31] = 0
    f[np.where(chosen)[0], 23 + rng.integers(0, 8, chosen.sum())] = 1
    set_uniform(6, 17, 0.15, 0.6)
    f[profile == 6, 18] = rng.choice([0.5, 1], (profile == 6).sum())
    f[profile == 6, 22] = 0
    set_uniform(7, 0, 0, 0.2)
    set_uniform(7, 1, 0.8, 1)
    set_uniform(7, 3, 0.85, 1)
    set_uniform(7, 5, 0.8, 1)
    set_uniform(7, 12, 0, 0.08)
    set_uniform(7, 4, 0, 0.08)
    set_uniform(8, 13, 0.86, 1)
    set_uniform(8, 33, 0.25, 0.85)
    set_uniform(9, 5, 0.05, 0.3)
    set_uniform(9, 3, 0.05, 0.35)
    chosen = profile == 9
    f[chosen, 23:31] = 0
    f[np.where(chosen)[0], 23 + rng.integers(0, 3, chosen.sum())] = 1
    for storm_group in [10, 11]:
        f[profile == storm_group, 23:31] = 0
        f[profile == storm_group, 34:36] = 0
        f[profile == storm_group, 38] = 1
        set_uniform(storm_group, 14, 0.7, 1)
        set_uniform(storm_group, 15, 0.6, 1)
        set_uniform(storm_group, 36, 0.65, 1)
        set_uniform(storm_group, 39, 0.75, 1)
        set_uniform(storm_group, 0, 0.1, 0.5)
        set_uniform(storm_group, 1, 0.5, 1)
        set_uniform(storm_group, 12, 0, 0.15)
        set_uniform(storm_group, 4, 0, 0.15)
        set_uniform(storm_group, 13, 0.1, 0.75)
    set_uniform(10, 6, 0.15, 0.4)
    set_uniform(11, 6, 0.75, 1)
    set_uniform(11, 11, 0.02, 0.3)
    set_uniform(11, 9, 0.15, 0.8)
    f[profile == 11, 21] = 0
    set_uniform(12, 37, 0.7, 1)
    set_uniform(12, 39, 0.8, 1)
    set_uniform(12, 40, 0.02, 0.2)
    f[profile == 12, 38] = 1
    set_uniform(13, 37, 0.6, 1)
    set_uniform(13, 39, 0.05, 0.3)
    f[profile == 13, 38] = 1 - 0.96 * f[profile == 13, 39]
    f[profile == 13, 40] = 0

    if shifted:
        # Ten equally sampled compound crises. A single all-danger distribution
        # would overrepresent 'camp' and conceal errors on food/fire/help actions.
        # This split is never used for fitting or checkpoint selection.
        group = rng.permutation(np.arange(count) % 10)
        f[:, 34:36] = 0
        f[:, 23:31] = 0
        f[:, 16] = 0
        # The first seven legacy crises retain mild independent weather context.
        f[:, 14:16] = 0
        f[:, 36:38] = 0
        f[:, 38:40] = 1
        f[:, 40] = rng.uniform(0.1, 0.55, count)
        def crisis(which: int, settings: dict[int, tuple[float, float]]) -> None:
            chosen = group == which
            for column, (low, high) in settings.items():
                f[chosen, column] = rng.uniform(low, high, chosen.sum()) if low != high else low
        crisis(0, {13: (0.88, 1), 12: (0.55, 1), 4: (0.45, 0.95), 2: (0.4, 0.85),
                   1: (0.15, 0.65), 14: (0.8, 1), 15: (0.6, 1), 36: (0.65, 1),
                   23: (1, 1), 33: (0.3, 0.85)})
        crisis(1, {0: (0.88, 1), 10: (0.2, 0.8), 1: (0.3, 0.8), 2: (0.45, 0.9),
                   12: (0, 0.15), 4: (0, 0.1), 13: (0.1, 0.8), 23: (1, 1), 5: (0.1, 0.5)})
        crisis(2, {1: (0, 0.12), 0: (0.1, 0.45), 2: (0.45, 0.9), 12: (0, 0.1),
                   4: (0, 0.1), 13: (0.1, 0.8), 5: (0.05, 0.35), 24: (1, 1)})
        crisis(3, {11: (0.01, 0.08), 9: (0.1, 0.6), 14: (0, 0), 15: (1, 1),
                   12: (0, 0.08), 4: (0, 0.08), 1: (0.5, 0.9), 0: (0.1, 0.35),
                   13: (0.55, 0.85), 21: (0, 0), 18: (0, 0), 17: (0.8, 1)})
        crisis(4, {18: (1, 1), 17: (0.05, 0.3), 8: (0.65, 1), 2: (0.65, 0.95),
                   1: (0.45, 0.9), 12: (0, 0.15), 4: (0, 0.1), 0: (0.1, 0.4),
                   13: (0.1, 0.8), 22: (0, 0), 27: (1, 1)})
        crisis(5, {10: (0, 0), 9: (0, 0.1), 0: (0.6, 0.85), 1: (0.4, 0.85),
                   11: (0.3, 0.7), 13: (0.2, 0.8), 12: (0, 0.15), 4: (0, 0.08),
                   32: (1, 1), 31: (0, 0), 20: (0, 0), 24: (1, 1)})
        crisis(6, {9: (0, 0), 10: (0.4, 0.8), 11: (0.05, 0.25), 0: (0.1, 0.4),
                   1: (0.45, 0.9), 13: (0.2, 0.8), 12: (0, 0.15), 4: (0, 0.08),
                   31: (1, 1), 32: (0, 0), 19: (0, 0), 23: (1, 1)})
        crisis(7, {0: (0.1, 0.45), 1: (0.6, 1), 6: (0.15, 0.4), 11: (0.55, 0.95),
                   12: (0, 0.12), 4: (0, 0.12), 13: (0.1, 0.75), 14: (0.75, 1), 15: (0.7, 1),
                   36: (0.7, 1), 37: (0.1, 0.6), 38: (1, 1), 39: (0.8, 1), 40: (0.15, 0.6)})
        crisis(8, {0: (0.1, 0.4), 1: (0.65, 1), 6: (0.8, 1), 9: (0.2, 0.8), 11: (0.01, 0.15),
                   12: (0, 0.12), 4: (0, 0.12), 13: (0.2, 0.75), 14: (0.7, 1), 15: (0.65, 1),
                   21: (0, 0), 36: (0.6, 1), 37: (0, 0.3), 38: (1, 1), 39: (0.8, 1), 40: (0.1, 0.5)})
        crisis(9, {0: (0.1, 0.5), 1: (0.4, 0.85), 12: (0, 0.12), 4: (0, 0.12), 13: (0.1, 0.75),
                   14: (0.25, 0.55), 15: (0.15, 0.45), 36: (0, 0.15), 37: (0.8, 1),
                   38: (1, 1), 39: (0.75, 1), 40: (0.05, 0.3)})
    # Mix stocked villages, insufficient staffing and already committed replenishment.
    population = rng.integers(1, 10, count)
    minimum = population * rng.uniform(2, 3.6, count)
    target = minimum + population
    stock = np.where(rng.random(count) < .2, 0, rng.uniform(0, 2, count) * minimum)
    committed = rng.integers(0, 10, count) * 4
    f[:, 10] = stock / 15
    f[:, 11] = 1
    f[:, 21] = 0
    f[:, 25] = 0
    f[:, 41] = stock / minimum
    f[:, 42] = (stock + committed) / target
    f[:, 43] = ((stock < minimum) | (committed > 0)) & (stock + committed < target)
    return np.clip(f, 0, 1).astype(np.float32)


def forward(params: list[np.ndarray], x: np.ndarray):
    h1 = np.maximum(0, x @ params[0] + params[1])
    h2 = np.maximum(0, h1 @ params[2] + params[3])
    return h2 @ params[4] + params[5], h2 @ params[6] + params[7], h1, h2


def evaluate(params: list[np.ndarray], x: np.ndarray) -> dict:
    true_action, true_emotion = teacher(x)
    action, emotion, _, _ = forward(params, x)
    masks = legal_masks(x)
    true_a = np.where(masks, true_action, -1e9).argmax(axis=1)
    pred_a = np.where(masks, action, -1e9).argmax(axis=1)
    true_e, pred_e = true_emotion.argmax(axis=1), emotion.argmax(axis=1)
    def per_class(labels, expected, actual):
        return {name: {"samples": int((expected == i).sum()),
                       "accuracy": round(float((actual[expected == i] == i).mean()), 6) if np.any(expected == i) else None}
                for i, name in enumerate(labels)}
    action_matrix = np.zeros((8, 8), dtype=int)
    emotion_matrix = np.zeros((5, 5), dtype=int)
    np.add.at(action_matrix, (true_a, pred_a), 1)
    np.add.at(emotion_matrix, (true_e, pred_e), 1)
    masked_true = np.where(masks, true_action, -1e9)
    top_two = np.sort(masked_true, axis=1)[:, -2:]
    decisive = top_two[:, 1] - top_two[:, 0] >= 0.5
    return {
        "samples": len(x), "actionAccuracy": round(float((true_a == pred_a).mean()), 6),
        "emotionAccuracy": round(float((true_e == pred_e).mean()), 6),
        "actionMAE": round(float(np.abs(action - true_action).mean()), 6),
        "emotionMAE": round(float(np.abs(emotion - true_emotion).mean()), 6),
        "decisiveActionSamples": int(decisive.sum()),
        "decisiveActionAccuracy": round(float((true_a[decisive] == pred_a[decisive]).mean()), 6),
        "actionByClass": per_class(ACTIONS, true_a, pred_a),
        "emotionByClass": per_class(EMOTIONS, true_e, pred_e),
        "actionConfusionMatrix": action_matrix.tolist(), "emotionConfusionMatrix": emotion_matrix.tolist(),
    }


def named_cases() -> list[tuple[str, np.ndarray]]:
    basic = np.array([0.25, 0.82, 0.95, 0.7, 0.04, 0.7, 0.55, 0.75, 0.5,
                      0.2, 0.2, 0.8, 0.03, 0.3, 0, 0, 0, 0.95, 0,
                      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.12, 0, 0,
                      0, 0, 1, 1, 0.3, 1, 1, 0], dtype=np.float32)
    specifications = [
        ("ordinary", {}), ("hungry", {0: 0.97, 10: 0.7}),
        ("survival_reserve", {10: .2, 41: .2, 42: .3, 43: 1, 23: 1}),
        ("survival_eat_first", {0: .65, 10: .2, 41: .2, 42: .3, 43: 1}),
        ("survival_empty", {0: .85, 10: 0, 41: 0, 42: 0, 43: 1}),
        ("survival_replenish", {10: 1, 41: 1, 42: .85, 43: 1, 23: 1}),
        ("fatigued", {1: 0.03}), ("danger", {12: 0.98, 4: 0.93, 6: 0.2, 33: 0.65}),
        ("commanded_wood", {23: 1}), ("commanded_rest", {27: 1}),
        ("exhausted_refusal", {1: 0.01, 5: 0.15, 3: 0.25, 0: 0.45, 23: 1}),
        ("late_return", {13: 0.98, 33: 0.7, 23: 1}),
        ("help_ally", {17: 0.35, 18: 0.5, 8: 0.95}),
        ("fire_emergency", {11: 0.03, 9: 0.4, 13: 0.72, 14: 1}),
        ("happy", {3: 0.98, 5: 0.95, 0: 0.05, 1: 0.99, 9: 0.8, 10: 0.8, 11: 1}),
        ("annoyed", {3: 0.15, 5: 0.1, 1: 0.2, 23: 1}),
        ("food_priority", {32: 1}), ("wood_priority", {31: 1}),
        ("weather_clear", {6: 0.27, 33: 0.45, 40: 0.45}),
        ("weather_storm_shelter", {6: 0.27, 14: 0.95, 15: 0.85, 33: 0.45, 36: 0.9, 40: 0.45}),
        ("storm_cautious_rest", {6: 0.27, 9: 0.4, 10: 0.5, 11: 0.2, 14: 0.9, 15: 0.8,
                                  33: 0.18, 36: 0.85, 37: 0.3, 40: 0.25}),
        ("storm_brave_fire", {6: 0.9, 9: 0.4, 10: 0.5, 11: 0.2, 14: 0.9, 15: 0.8,
                               33: 0.18, 36: 0.85, 37: 0.3, 40: 0.25}),
        ("wet_shelter", {14: 0.5, 15: 0.3, 37: 0.9, 40: 0.2}),
        ("protected_storm", {14: 0.9, 15: 0.8, 36: 0.85, 37: 0.2, 38: 0.04, 40: 0}),
        ("torn_shelter", {14: 0.9, 15: 0.8, 36: 0.85, 37: 0.8, 38: 0.904, 39: 0.1, 40: 0}),
        ("wind_fire_emergency", {6: 0.9, 9: 0.4, 11: 0.03, 14: 0.55, 15: 0.45,
                                    33: 0.12, 36: 0.1, 38: 0.2, 40: 0.05}),
    ]
    result = []
    for name, changes in specifications:
        value = basic.copy()
        for key, item in changes.items():
            value[key] = item
        result.append((name, value))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=20261015)
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--train-size", type=int, default=64000)
    parser.add_argument("--validation-size", type=int, default=8000)
    parser.add_argument("--test-size", type=int, default=12000)
    parser.add_argument("--stress-size", type=int, default=8000)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[1] / "public" / "models")
    args = parser.parse_args()
    if min(args.epochs, args.train_size, args.validation_size, args.test_size, args.stress_size) <= 0:
        parser.error("all sizes and epochs must be positive")
    started = time.perf_counter()
    rng = np.random.default_rng(args.seed)
    train = generate_states(args.train_size, args.seed + 10)
    target_a, target_e = teacher(train)
    validation = generate_states(args.validation_size, args.seed + 20)
    dimensions = [(len(FEATURE_NAMES), 64), (64,), (64, 48), (48,), (48, 8), (8,), (48, 5), (5,)]
    params = [(rng.normal(0, np.sqrt(2 / shape[0]), shape) if len(shape) == 2 else np.zeros(shape)).astype(np.float32)
              for shape in dimensions]
    first = [np.zeros_like(value) for value in params]
    second = [np.zeros_like(value) for value in params]
    batch_size, step, best_epoch, best_score = 512, 0, 0, -np.inf
    best = [value.copy() for value in params]
    for epoch in range(1, args.epochs + 1):
        order = rng.permutation(len(train))
        learning_rate = 0.0025 * (0.2 + 0.8 * (1 - (epoch - 1) / args.epochs))
        for start in range(0, len(train), batch_size):
            indices = order[start:start + batch_size]
            x = train[indices]
            pa, pe, h1, h2 = forward(params, x)
            da = (pa - target_a[indices]) * (0.35 / (len(x) * 8))
            de = (pe - target_e[indices]) / (len(x) * 5)
            dh2 = (da @ params[4].T + de @ params[6].T) * (h2 > 0)
            dh1 = (dh2 @ params[2].T) * (h1 > 0)
            gradients = [x.T @ dh1, dh1.sum(axis=0), h1.T @ dh2, dh2.sum(axis=0),
                         h2.T @ da, da.sum(axis=0), h2.T @ de, de.sum(axis=0)]
            step += 1
            for i, gradient in enumerate(gradients):
                first[i] *= 0.9
                first[i] += 0.1 * gradient
                second[i] *= 0.999
                second[i] += 0.001 * gradient * gradient
                params[i] -= learning_rate * (first[i] / (1 - 0.9 ** step)) / (np.sqrt(second[i] / (1 - 0.999 ** step)) + 1e-8)
        metrics = evaluate(params, validation)
        quality = metrics["actionAccuracy"] + 0.65 * metrics["emotionAccuracy"] - 0.015 * metrics["actionMAE"]
        if quality > best_score:
            best_score, best_epoch = quality, epoch
            best = [value.copy() for value in params]
        if epoch == 1 or epoch % 10 == 0 or epoch == args.epochs:
            print(f"epoch {epoch:02d}/{args.epochs}: validation action={metrics['actionAccuracy']:.4%}, "
                  f"emotion={metrics['emotionAccuracy']:.4%}, action MAE={metrics['actionMAE']:.4f}", flush=True)

    params = best
    held_out = evaluate(params, generate_states(args.test_size, args.seed + 30))
    shifted = evaluate(params, generate_states(args.stress_size, args.seed + 40, shifted=True))
    values = np.concatenate([value.ravel() for value in params]).astype("<f4")
    if not np.isfinite(values).all():
        raise RuntimeError("Training produced non-finite weights")
    binary = values.tobytes()
    tensors, offset = [], 0
    for name, value in zip(TENSOR_NAMES, params):
        tensors.append({"name": name, "shape": list(value.shape), "offset": offset, "length": value.size})
        offset += value.size
    manifest = {
        "version": 1, "observationSchemaVersion": 3, "format": "campmind-f32-mlp", "name": "村寨生存库存策略网络 v3", "kind": "supervised-mlp", "dtype": "float32-le",
        "featureNames": FEATURE_NAMES, "actions": ACTIONS, "emotions": EMOTIONS,
        "architecture": {"input": len(FEATURE_NAMES), "hidden": [64, 48], "action": 8, "emotion": 5, "activation": "relu"},
        "tensors": tensors, "parameterCount": int(values.size), "weightBytes": len(binary),
        "weightsFile": "policy.f32", "sha256": hashlib.sha256(binary).hexdigest(),
        "training": {"seed": args.seed, "teacher": "campmind-survival-teacher-v3", "optimizer": "Adam", "loss": "0.35 * action MSE + emotion MSE",
                     "epochs": args.epochs, "selectedEpoch": best_epoch, "batchSize": batch_size, "steps": step,
                     "trainSamples": args.train_size, "validationSamples": args.validation_size,
                     "splitSeeds": {"train": args.seed + 10, "validation": args.seed + 20, "heldOut": args.seed + 30, "shifted": args.seed + 40},
                     "numpyVersion": np.__version__, "blasThreads": 1,
                     "shiftedProfiles": ["late storm with outdoor order", "starvation with work order", "exhaustion with work order",
                                         "low fire in wind", "two injured allies with rest order", "no food with hunger", "no wood with low fire",
                                         "exposed cautious NPC in thunderstorm", "brave NPC with critical fire in thunderstorm", "soaked NPC near shelter"]},
        "metrics": {"validation": evaluate(params, validation), "heldOut": held_out, "shifted": shifted},
        "scope": "Synthetic teacher imitation for eight camp actions and five emotion labels. Not an LLM, language understanding model, or proof of better gameplay than rules.",
        "inputRange": [0, 1], "scoreMeaning": "Relative masked action preferences, not calibrated success probabilities.",
        "license": "Not separately specified. These weights are trained here on script-generated synthetic data; no third-party pretrained weights are included.",
    }
    cases = named_cases()
    # Unhandpicked reference states supplement the named critical scenarios.
    cases.extend((f"random_{i:02d}", value) for i, value in enumerate(generate_states(32, args.seed + 50)))
    fixtures = []
    for name, value in cases:
        pa, pe, _, _ = forward(params, value[None, :])
        ta, te = teacher(value[None, :])
        mask = legal_masks(value[None, :])[0]
        fixtures.append({"name": name, "features": value.tolist(), "allowed": [action for i, action in enumerate(ACTIONS) if mask[i]],
                         "actionLogits": pa[0].tolist(), "emotionLogits": pe[0].tolist(),
                         "teacherActionScores": ta[0].tolist(), "teacherEmotionScores": te[0].tolist(),
                         "action": ACTIONS[int(np.where(mask, pa[0], -1e9).argmax())], "emotion": EMOTIONS[int(pe[0].argmax())],
                         "teacherAction": ACTIONS[int(np.where(mask, ta[0], -1e9).argmax())], "teacherEmotion": EMOTIONS[int(te[0].argmax())]})
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "policy.f32").write_bytes(binary)
    for filename, data in [("manifest.json", manifest), ("parity-fixtures.json", {"version": 1, "seed": args.seed + 50, "cases": fixtures})]:
        (args.output_dir / filename).write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf8")
    print(json.dumps({"selectedEpoch": best_epoch, "parameters": values.size, "weightBytes": len(binary),
                      "sha256": manifest["sha256"], "heldOutActionAccuracy": held_out["actionAccuracy"],
                      "heldOutEmotionAccuracy": held_out["emotionAccuracy"], "shiftedActionAccuracy": shifted["actionAccuracy"],
                      "shiftedEmotionAccuracy": shifted["emotionAccuracy"], "elapsedSeconds": round(time.perf_counter() - started, 2)}, indent=2), flush=True)
    for item in fixtures[:len(named_cases())]:
        print(f"{item['name']}: model={item['action']}/{item['emotion']}, teacher={item['teacherAction']}/{item['teacherEmotion']}")


if __name__ == "__main__":
    main()
