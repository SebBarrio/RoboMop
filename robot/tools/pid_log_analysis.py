#!/usr/bin/env python3
"""PID log analysis and plotting utility for RoboMop manual tests.

This script consumes CSV logs produced by `slam_navigation_triangle_test.py`
and can:
  - Plot commanded vs. actual linear and angular velocities.
  - Plot the XY trajectory.
  - Compute basic error statistics useful for PID tuning.

Usage (from repo root):
    cd robot
    python tools/pid_log_analysis.py --plot log1.csv log2.csv

The `--plot` flag requires `matplotlib`. If it is not installed, the script
will still compute and print statistics but will skip plotting.
"""

from __future__ import annotations

import argparse
import csv
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence


@dataclass(slots=True)
class Sample:
    t: float
    wall_time: float
    linear_speed: float
    angular_speed: float
    linear_cmd: float
    angular_cmd: float
    left_target: float
    right_target: float
    x: float
    y: float
    theta: float


@dataclass(slots=True)
class Metrics:
    label: str
    n_samples: int
    linear_cmd_mean: float
    linear_speed_mean: float
    linear_error_rmse: float
    linear_error_steady_rmse: float
    linear_overshoot_pct: float
    straight_segment_fraction: float


def _load_log(path: Path) -> List[Sample]:
    rows: List[Sample] = []
    with path.open("r", newline="") as f:
        reader = csv.DictReader(f)
        raw_rows = [row for row in reader]
    if not raw_rows:
        raise ValueError(f"{path} is empty")
    # Use first valid monotonic timestamp as t0
    t0: float | None = None
    for row in raw_rows:
        mono_str = row.get("monotonic_time_s", "").strip()
        if mono_str:
            t0 = float(mono_str)
            break
    if t0 is None:
        raise ValueError(f"{path} has no monotonic_time_s values")

    for row in raw_rows:
        mono_str = row.get("monotonic_time_s", "").strip()
        if not mono_str:
            continue
        try:
            wall_time = float(row["wall_time_epoch_s"])
            t_rel = float(mono_str) - t0
            linear_speed = float(row["linear_speed_mps"])
            angular_speed = float(row["angular_speed_rps"])
            linear_cmd = float(row.get("linear_cmd_mps", "0.0"))
            angular_cmd = float(row.get("angular_cmd_rps", "0.0"))
            left_target = float(row.get("left_wheel_target_rad_s", "0.0"))
            right_target = float(row.get("right_wheel_target_rad_s", "0.0"))
            x = float(row["pose_x_m"])
            y = float(row["pose_y_m"])
            theta = float(row["theta_rad"])
        except (KeyError, ValueError):
            # Skip malformed rows (e.g. trailing blank line)
            continue
        rows.append(
            Sample(
                t=t_rel,
                wall_time=wall_time,
                linear_speed=linear_speed,
                angular_speed=angular_speed,
                linear_cmd=linear_cmd,
                angular_cmd=angular_cmd,
                left_target=left_target,
                right_target=right_target,
                x=x,
                y=y,
                theta=theta,
            )
        )
    if not rows:
        raise ValueError(f"{path} has no valid data rows")
    return rows


def _compute_metrics(label: str, samples: Sequence[Sample]) -> Metrics:
    n = len(samples)
    if n == 0:
        raise ValueError("No samples for metrics")

    cmd_vals = [s.linear_cmd for s in samples]
    speed_vals = [s.linear_speed for s in samples]
    linear_cmd_mean = sum(cmd_vals) / n
    linear_speed_mean = sum(speed_vals) / n

    # Overall RMSE between command and actual
    error_vals = [s.linear_cmd - s.linear_speed for s in samples]
    linear_error_rmse = math.sqrt(sum(e * e for e in error_vals) / n)

    # Focused "straight, steady" segments: small angular command and non-trivial forward command.
    straight_samples: List[Sample] = [
        s for s in samples if abs(s.angular_cmd) < 0.05 and s.linear_cmd > 0.25
    ]
    if straight_samples:
        err_straight = [s.linear_cmd - s.linear_speed for s in straight_samples]
        linear_error_steady_rmse = math.sqrt(
            sum(e * e for e in err_straight) / len(err_straight)
        )
        # Overshoot relative to mean commanded speed in straight segment
        straight_cmd_mean = sum(s.linear_cmd for s in straight_samples) / len(
            straight_samples
        )
        straight_speed_max = max(s.linear_speed for s in straight_samples)
        if straight_cmd_mean > 1e-6:
            linear_overshoot_pct = (
                (straight_speed_max - straight_cmd_mean) / straight_cmd_mean
            ) * 100.0
        else:
            linear_overshoot_pct = 0.0
        straight_fraction = len(straight_samples) / n
    else:
        linear_error_steady_rmse = float("nan")
        linear_overshoot_pct = float("nan")
        straight_fraction = 0.0

    return Metrics(
        label=label,
        n_samples=n,
        linear_cmd_mean=linear_cmd_mean,
        linear_speed_mean=linear_speed_mean,
        linear_error_rmse=linear_error_rmse,
        linear_error_steady_rmse=linear_error_steady_rmse,
        linear_overshoot_pct=linear_overshoot_pct,
        straight_segment_fraction=straight_fraction,
    )


def _maybe_plot(label: str, samples: Sequence[Sample], out_dir: Path) -> None:
    try:
        import matplotlib.pyplot as plt  # type: ignore
    except Exception:
        print(f"[WARN] matplotlib not available; skipping plots for {label}")
        return

    out_dir.mkdir(parents=True, exist_ok=True)

    t = [s.t for s in samples]

    # Linear velocities
    fig1, ax1 = plt.subplots(figsize=(10, 4))
    ax1.plot(t, [s.linear_cmd for s in samples], label="linear_cmd (m/s)")
    ax1.plot(t, [s.linear_speed for s in samples], label="linear_speed (m/s)")
    ax1.set_xlabel("time (s)")
    ax1.set_ylabel("linear speed (m/s)")
    ax1.set_title(f"{label}: linear velocity")
    ax1.grid(True, alpha=0.3)
    ax1.legend()
    fig1.tight_layout()
    fig1.savefig(out_dir / f"{label}_linear.png", dpi=150)
    plt.close(fig1)

    # Angular velocities
    fig2, ax2 = plt.subplots(figsize=(10, 4))
    ax2.plot(t, [s.angular_cmd for s in samples], label="angular_cmd (rad/s)")
    ax2.plot(t, [s.angular_speed for s in samples], label="angular_speed (rad/s)")
    ax2.set_xlabel("time (s)")
    ax2.set_ylabel("angular speed (rad/s)")
    ax2.set_title(f"{label}: angular velocity")
    ax2.grid(True, alpha=0.3)
    ax2.legend()
    fig2.tight_layout()
    fig2.savefig(out_dir / f"{label}_angular.png", dpi=150)
    plt.close(fig2)

    # XY trajectory
    fig3, ax3 = plt.subplots(figsize=(6, 6))
    ax3.plot([s.x for s in samples], [s.y for s in samples], label="trajectory")
    ax3.scatter([samples[0].x], [samples[0].y], c="green", label="start")
    ax3.set_aspect("equal", adjustable="box")
    ax3.set_xlabel("x (m)")
    ax3.set_ylabel("y (m)")
    ax3.set_title(f"{label}: XY path")
    ax3.grid(True, alpha=0.3)
    ax3.legend()
    fig3.tight_layout()
    fig3.savefig(out_dir / f"{label}_path.png", dpi=150)
    plt.close(fig3)

    print(f"[INFO] Saved plots for {label} to {out_dir}")


def analyze_logs(paths: Iterable[Path], plot: bool) -> None:
    out_dir = Path("pid_plots")
    for path in paths:
        label = path.stem
        print(f"=== {label} ===")
        samples = _load_log(path)
        metrics = _compute_metrics(label, samples)
        print(f"Samples: {metrics.n_samples}")
        print(f"Mean linear_cmd:   {metrics.linear_cmd_mean:.4f} m/s")
        print(f"Mean linear_speed: {metrics.linear_speed_mean:.4f} m/s")
        print(f"RMSE (all):        {metrics.linear_error_rmse:.4f} m/s")
        if math.isfinite(metrics.linear_error_steady_rmse):
            print(f"RMSE (straight):   {metrics.linear_error_steady_rmse:.4f} m/s")
            print(f"Overshoot (straight): {metrics.linear_overshoot_pct:.1f}%")
            print(
                f"Straight segment fraction: {metrics.straight_segment_fraction * 100.0:.1f}%"
            )
        else:
            print("No straight segments detected for steady-state analysis.")
        print()

        if plot:
            _maybe_plot(label, samples, out_dir)


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze RoboMop PID CSV logs.")
    parser.add_argument("logs", nargs="+", help="Paths to CSV log files.")
    parser.add_argument(
        "--plot",
        action="store_true",
        help="Generate PNG plots (requires matplotlib).",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = _parse_args(argv)
    log_paths = [Path(p) for p in args.logs]
    analyze_logs(log_paths, plot=args.plot)


if __name__ == "__main__":
    main()


