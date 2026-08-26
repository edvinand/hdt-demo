#!/usr/bin/env python3
"""Plot HDT throughput logs produced by overnight_test.py (or the hdt-demo GUI).

For each PHY it draws two stacked, time-aligned panels:
  1. average throughput (kbps)
  2. transfer time for the virtual file (mm:ss)

so you can see how every PHY behaves across the night / weekend. Per-PHY
checkboxes (plus All/None buttons) let you focus on a subset of PHYs live, and
the axes auto-rescale to whatever is visible.

Usage:
  python plot_throughput.py                 # prompt to pick a log (Enter = latest)
  python plot_throughput.py --latest        # newest log, no prompt
  python plot_throughput.py --all           # every log in ./logs (overlaid)
  python plot_throughput.py run1.txt run2.txt
  python plot_throughput.py --phys HDT7.5,HDT6
  python plot_throughput.py --all --time-of-day   # fold onto a 24h axis

Requires: pip install matplotlib
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path
from statistics import mean, median

try:
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt
    from matplotlib.ticker import FuncFormatter
    from matplotlib.widgets import Button, CheckButtons
except ImportError:
    print("This script needs matplotlib. Install it with:  pip install matplotlib")
    sys.exit(1)

LOG_DIR = Path(__file__).resolve().parent / "logs"

# PHY draw order and stable colors so plots are comparable across runs.
PHY_ORDER = ["HDT7.5", "HDT6", "HDT4", "HDT3", "HDT2", "LE 2M", "LE 1M"]
PHY_COLORS = {
    "HDT7.5": "#0033A0",
    "HDT6": "#00A9CE",
    "HDT4": "#2E9E5B",
    "HDT3": "#F2A900",
    "HDT2": "#C8102E",
    "LE 2M": "#6A1B9A",
    "LE 1M": "#546E7A",
}

# Detected stalls: a wall-clock gap this many times longer than the transfer
# time indicates the run paused (e.g. USB suspend) between two completions.
STALL_RATIO = 1.5

# How many recent logs to list in the interactive picker.
PICKER_LIMIT = 9


def newest_first():
    return sorted(LOG_DIR.glob("hdt-run-*.txt"), key=lambda p: p.name, reverse=True)


def load_rows(paths):
    rows = []
    for path in paths:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or line.startswith("timestamp,"):
                    continue
                parts = line.split(",")
                if len(parts) < 6:
                    continue  # tolerate a corrupted/partial last line
                try:
                    # Drop the tz so the axis (which matplotlib renders in UTC)
                    # and the title both show the logged local wall-clock.
                    ts = datetime.fromisoformat(parts[0]).replace(tzinfo=None)
                    row = {
                        "ts": ts,
                        "phy": parts[1],
                        "file_mb": float(parts[2]),
                        "tp": float(parts[3]),
                        "avg": float(parts[4]),
                        "transfer_s": float(parts[5]) / 1000.0,
                        "source": path.name,
                    }
                except ValueError:
                    continue
                rows.append(row)
    rows.sort(key=lambda r: r["ts"])
    return rows


def fold_time_of_day(ts):
    # Collapse to a single reference day, keeping only the clock time.
    return ts.replace(year=2000, month=1, day=1, tzinfo=None)


def find_stalls(rows):
    """Flag rows whose wall-clock gap from the previous completion greatly
    exceeds their transfer time (a paused/suspended interval)."""
    stalls = []
    for prev, cur in zip(rows, rows[1:]):
        if prev["source"] != cur["source"]:
            continue  # don't flag the boundary between two separate log files
        gap_s = (cur["ts"] - prev["ts"]).total_seconds()
        if cur["transfer_s"] > 0 and gap_s > cur["transfer_s"] * STALL_RATIO + 10:
            stalls.append((cur, gap_s))
    return stalls


def prompt_for_log(candidates):
    """Interactively pick a log: Enter = latest, a number, or a filename."""
    shown = candidates[:PICKER_LIMIT]
    print(f"\nLogs in {LOG_DIR} (newest first):")
    for i, p in enumerate(shown, 1):
        tag = "   (latest)" if i == 1 else ""
        print(f"  {i}. {p.name}{tag}")

    while True:
        choice = input(
            f"Select 1-{len(shown)}, type a filename, or press Enter for latest "
            "[default: latest]: "
        ).strip()
        if not choice:
            return [candidates[0]]
        if choice.isdigit():
            n = int(choice)
            if 1 <= n <= len(shown):
                return [shown[n - 1]]
            print(f"  Please enter a number between 1 and {len(shown)}.")
            continue
        p = Path(choice)
        if not p.exists():
            p = LOG_DIR / choice
        if p.exists():
            return [p]
        print(f"  File not found: {choice}")


def plot(rows, time_of_day, out, selected_phys):
    phys = [p for p in PHY_ORDER if any(r["phy"] == p for r in rows)]
    if selected_phys is not None:
        unknown = [p for p in selected_phys if p not in phys]
        if unknown:
            print(f"WARNING: --phys names not present in data: {', '.join(unknown)}")
    visible = {
        phy: (selected_phys is None or phy in selected_phys) for phy in phys
    }

    fig, (ax_tp, ax_t) = plt.subplots(2, 1, sharex=True, figsize=(13, 8))
    fig.subplots_adjust(left=0.23, right=0.91, top=0.92, bottom=0.1, hspace=0.15)

    lines_tp = {}
    lines_t = {}
    for phy in phys:
        pts = [r for r in rows if r["phy"] == phy]
        xs = [fold_time_of_day(r["ts"]) if time_of_day else r["ts"] for r in pts]
        order = sorted(range(len(xs)), key=lambda i: xs[i])
        xs = [xs[i] for i in order]
        avg = [pts[i]["avg"] for i in order]
        tt = [pts[i]["transfer_s"] for i in order]
        color = PHY_COLORS.get(phy)
        # Markers only when folding (a connecting line would jump across noon).
        style = "o" if time_of_day else "-o"
        (lines_tp[phy],) = ax_tp.plot(
            xs, avg, style, color=color, label=phy, ms=4, lw=1.3, alpha=0.85
        )
        (lines_t[phy],) = ax_t.plot(
            xs, tt, style, color=color, label=phy, ms=4, lw=1.3, alpha=0.85
        )
        lines_tp[phy].set_visible(visible[phy])
        lines_t[phy].set_visible(visible[phy])

    ax_tp.set_ylabel("Avg throughput (kbps)")
    ax_tp.yaxis.set_label_position("right")
    ax_tp.yaxis.tick_right()
    ax_tp.grid(True, alpha=0.3)
    ax_tp.legend(title="PHY", ncol=len(phys), loc="lower right", fontsize=9)

    ax_t.set_ylabel("Transfer time (mm:ss)")
    ax_t.yaxis.set_label_position("right")
    ax_t.yaxis.tick_right()
    ax_t.grid(True, alpha=0.3)
    ax_t.yaxis.set_major_formatter(
        FuncFormatter(lambda s, _: f"{int(s) // 60:d}:{int(s) % 60:02d}")
    )
    ax_t.set_xlabel("Time of day" if time_of_day else "Time")
    ax_t.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M"))
    fig.autofmt_xdate()

    file_mb = int(rows[0]["file_mb"]) if rows else 0
    span = ""
    if rows and not time_of_day:
        span = f"  ({rows[0]['ts']:%Y-%m-%d %H:%M} \u2013 {rows[-1]['ts']:%H:%M})"
    fig.suptitle(
        f"HDT throughput over time \u2013 {file_mb} MB virtual file{span}", fontsize=13
    )

    def rescale_axis(ax, lines):
        ys = []
        for phy, line in lines.items():
            if visible[phy]:
                ys.extend(list(line.get_ydata()))
        if ys:
            top = max(ys)
            ax.set_ylim(0, top * 1.05 if top > 0 else 1)

    def rescale_visible():
        rescale_axis(ax_tp, lines_tp)
        rescale_axis(ax_t, lines_t)

    rescale_visible()

    # --- Interactive controls -------------------------------------------------
    state = {"batch": False}

    ax_check = fig.add_axes((0.015, 0.35, 0.185, 0.42))
    ax_check.set_title("Show PHY", fontsize=9)
    check = CheckButtons(ax_check, phys, [visible[p] for p in phys])
    for i, phy in enumerate(phys):
        check.labels[i].set_color(PHY_COLORS.get(phy, "black"))

    def on_check(label):
        visible[label] = not visible[label]
        lines_tp[label].set_visible(visible[label])
        lines_t[label].set_visible(visible[label])
        if not state["batch"]:
            rescale_visible()
            fig.canvas.draw_idle()

    check.on_clicked(on_check)

    def set_all(target):
        state["batch"] = True
        for i, phy in enumerate(phys):
            if visible[phy] != target:
                check.set_active(i)  # toggles and fires on_check
        state["batch"] = False
        rescale_visible()
        fig.canvas.draw_idle()

    ax_all = fig.add_axes((0.015, 0.27, 0.088, 0.05))
    ax_none = fig.add_axes((0.112, 0.27, 0.088, 0.05))
    btn_all = Button(ax_all, "All")
    btn_none = Button(ax_none, "None")
    btn_all.on_clicked(lambda _e: set_all(True))
    btn_none.on_clicked(lambda _e: set_all(False))

    if out:
        fig.savefig(out, dpi=120)
        print(f"Saved plot to {out}")

    # Keep widget references alive for the lifetime of the window.
    fig._hdt_widgets = (check, btn_all, btn_none)
    plt.show()


def print_summary(rows):
    print()
    print(f"{'PHY':<8}{'n':>4}{'mean':>8}{'median':>8}{'min':>7}{'max':>7}{'mean_t':>9}")
    print("-" * 51)
    for phy in PHY_ORDER:
        vals = [r for r in rows if r["phy"] == phy]
        if not vals:
            continue
        a = [r["avg"] for r in vals]
        t = [r["transfer_s"] for r in vals]
        print(
            f"{phy:<8}{len(vals):>4}{mean(a):>8.0f}{median(a):>8.0f}"
            f"{min(a):>7.0f}{max(a):>7.0f}{mean(t):>8.0f}s"
        )

    stalls = find_stalls(rows)
    if stalls:
        print(f"\n{len(stalls)} possible stall(s) (wall-clock gap >> transfer time):")
        for cur, gap_s in stalls:
            print(
                f"  {cur['ts']:%Y-%m-%d %H:%M:%S}  {cur['phy']:<7}"
                f"gap {gap_s:7.0f}s  vs transfer {cur['transfer_s']:6.0f}s"
            )
    else:
        print("\nNo stalls detected (all gaps ~= transfer time).")


def resolve_paths(args):
    if args.files:
        paths = []
        for name in args.files:
            p = Path(name)
            if not p.exists():
                p = LOG_DIR / name
            if p.exists():
                paths.append(p)
            else:
                print(f"WARNING: file not found: {name}", file=sys.stderr)
        return paths

    candidates = newest_first()
    if not candidates:
        return []
    if args.all:
        return list(reversed(candidates))  # chronological order for overlay
    if args.latest:
        return [candidates[0]]
    return prompt_for_log(candidates)


def main():
    parser = argparse.ArgumentParser(description="Plot HDT throughput logs.")
    parser.add_argument("files", nargs="*", help="log file(s); default: prompt to pick")
    parser.add_argument("--all", action="store_true", help="use every log in ./logs")
    parser.add_argument("--latest", action="store_true", help="use newest log without prompting")
    parser.add_argument("--phys", help="comma-separated PHYs to show at launch, e.g. HDT7.5,HDT6")
    parser.add_argument("--time-of-day", action="store_true",
                        help="fold all timestamps onto a single 24h axis")
    parser.add_argument("--out", help="path to save the PNG (default: alongside the log)")
    args = parser.parse_args()

    paths = resolve_paths(args)
    if not paths:
        print(f"No log files found in {LOG_DIR}", file=sys.stderr)
        return 1

    print("Reading:")
    for p in paths:
        print(f"  {p}")

    rows = load_rows(paths)
    if not rows:
        print("No data rows parsed from the given log(s).", file=sys.stderr)
        return 1

    selected_phys = None
    if args.phys:
        selected_phys = [s.strip() for s in args.phys.split(",") if s.strip()]

    out = args.out
    if out is None:
        stem = paths[-1].stem if len(paths) == 1 else "hdt-runs"
        suffix = "-time-of-day" if args.time_of_day else ""
        out = str(LOG_DIR / f"{stem}{suffix}.png")

    print_summary(rows)
    plot(rows, args.time_of_day, out, selected_phys)
    return 0


if __name__ == "__main__":
    sys.exit(main())
