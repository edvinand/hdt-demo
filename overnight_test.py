#!/usr/bin/env python3
"""Overnight HDT throughput logger.

Standalone replacement for the hdt-demo "Round Robin" mode for long,
unattended runs. Because it is a plain console process it is not subject to
the Electron renderer throttling that slows the GUI when the desktop is
locked, so it keeps measuring correctly overnight (disable system sleep).

It drives one HDT PHY at a time, simulates transferring a virtual file of
FILE_SIZE_MB using the throughput reported by the DK, and when that many
megabytes have been transferred it logs a line and advances to the next PHY.
The log file lives in the same folder and uses the same format as hdt-demo.

Requires: pip install pyserial
The nRF Connect hdt-demo app must be closed (the COM port is exclusive).
"""

import os
import sys
import time
from datetime import datetime
from pathlib import Path

import serial  # pyserial

# --------------------------------------------------------------------------
# Configuration (change these here only)
# --------------------------------------------------------------------------
# Default port; can be overridden on the command line: python overnight_test.py COM77
PORT = "COM78"
BAUD = 115200

# The single place to change the virtual file size.
FILE_SIZE_MB = 50

# Device configuration, matching the hdt-demo defaults. The firmware clamps
# these, so out-of-range values are corrected on the device.
DELAY = 5                    # 0..10
CONN_INTERVAL_UNITS = 40     # 6..400 (x1.25 ms)
PACKET_SIZE_BYTES = 247      # 23..498 (device clamps to MTU)

# PHY indices to cycle through, in order. HDT PHYs only (no LE 1M / LE 2M).
# Index -> label mapping mirrors hdt-demo's PHY_LABELS.
PHY_LABELS = ["HDT7.5", "HDT6", "HDT4", "HDT3", "HDT2", "LE 2M", "LE 1M"]
ENABLED_PHYS = [0, 1, 2, 3, 4]

# Log destination: hdt-demo writes to <app dir>/logs; this script sits in the
# hdt-demo root, so its own folder + /logs matches that destination.
LOG_DIR = Path(__file__).resolve().parent / "logs"

# If no fresh report for the active PHY arrives within this many seconds, the
# throughput is treated as 0 so a dead link cannot inflate progress.
STALE_TIMEOUT_S = 3.0

# Print a status line to the console this often.
STATUS_INTERVAL_S = 5.0

# --------------------------------------------------------------------------
# Derived constants
# --------------------------------------------------------------------------
FILE_SIZE_BITS = FILE_SIZE_MB * 1024 * 1024 * 8


def clamp(value, low, high):
    return max(low, min(high, value))


def file_timestamp(dt):
    """Filesystem-safe timestamp used in the log file name."""
    return dt.strftime("%Y-%m-%d_%H-%M-%S")


def line_timestamp(dt):
    """Local ISO-8601 timestamp with UTC offset, e.g. 2026-08-19T11:25:29+02:00."""
    base = dt.strftime("%Y-%m-%dT%H:%M:%S")
    offset = dt.strftime("%z")  # +0200
    if offset:
        offset = f"{offset[:3]}:{offset[3:]}"
    return base + offset


def now_local():
    return datetime.now().astimezone()


def build_config_command(phy_index):
    """Build the $$... config string exactly as hdt-demo does, for a single PHY."""
    delay_hex = format(clamp(DELAY, 0, 10), "02x")
    phys_hex = format(1 << phy_index, "02x")
    file_hex = format(clamp(FILE_SIZE_MB, 1, 100), "04x")
    interval_hex = format(clamp(CONN_INTERVAL_UNITS, 6, 400), "04x")
    packet_hex = format(clamp(PACKET_SIZE_BYTES, 23, 498), "04x")
    return f"$$d{delay_hex},p{phys_hex},f{file_hex},i{interval_hex},m{packet_hex}\r"


class RunLog:
    """Writes the same header and CSV format as hdt-demo, flushing every line."""

    def __init__(self, directory):
        directory.mkdir(parents=True, exist_ok=True)
        created = now_local()
        self.path = directory / f"hdt-run-{file_timestamp(created)}.txt"
        self._fh = open(self.path, "a", encoding="utf-8", newline="\n")
        self._write_line(f"# HDT throughput run started {line_timestamp(created)}")
        self._write_line(
            "# config: "
            f"virtual_file_size_mb={FILE_SIZE_MB} "
            f"conn_interval_units={CONN_INTERVAL_UNITS} "
            f"packet_size_bytes={PACKET_SIZE_BYTES} "
            f"delay={DELAY}"
        )
        self._write_line(
            "timestamp,phy,virtual_file_size_mb,throughput_kbps,"
            "avg_throughput_kbps,transfer_time_ms"
        )

    def _write_line(self, line):
        # Flush + fsync each line so a hard stop can at most corrupt the last
        # line, never a previously completed one.
        self._fh.write(line + "\n")
        self._fh.flush()
        os.fsync(self._fh.fileno())

    def log_completion(self, phy_name, throughput_kbps, avg_kbps, transfer_ms):
        self._write_line(
            f"{line_timestamp(now_local())},{phy_name},{FILE_SIZE_MB},"
            f"{round(throughput_kbps)},{round(avg_kbps)},{round(transfer_ms)}"
        )

    def close(self):
        try:
            self._fh.close()
        except OSError:
            pass


def parse_frames(buffer):
    """Yield (phy, throughput_kbps) from a bytearray, mirroring hdt-demo's parser.

    Frame layout: [0xFF][phy][throughput_hi][throughput_lo]. Consumed bytes are
    removed from ``buffer`` in place; a partial trailing frame is left intact.
    """
    while len(buffer) >= 4:
        # Discard until the frame marker 0xFF.
        while buffer and buffer[0] != 0xFF:
            del buffer[0]
        if len(buffer) < 4:
            break
        _marker = buffer[0]
        phy = buffer[1]
        throughput = (buffer[2] << 8) | buffer[3]
        del buffer[0:4]
        yield phy, throughput


class PhyTransfer:
    """Simulates one virtual file transfer, matching hdt-demo's integration."""

    def __init__(self):
        self.transferred_bits = 0.0
        self.elapsed_ms = 0.0
        self.sum_kbps_ms = 0.0   # numerator for average throughput
        self.active_ms = 0.0     # denominator for average throughput

    @property
    def progress_pct(self):
        return self.transferred_bits / FILE_SIZE_BITS * 100.0

    @property
    def avg_kbps(self):
        return self.sum_kbps_ms / self.active_ms if self.active_ms > 0 else 0.0

    @property
    def done(self):
        return self.transferred_bits >= FILE_SIZE_BITS

    def tick(self, throughput_kbps, dt_ms):
        progress = self.progress_pct
        if throughput_kbps > 0 and progress < 100.0:
            # bits = kbps * ms  (kbps*1000 bits/s * dt_ms/1000 s)
            self.transferred_bits += throughput_kbps * dt_ms
            self.elapsed_ms += dt_ms

        # Average excludes the warm-up before 1% progress, then counts all
        # time (including stalls) so it reflects the true average rate.
        if self.progress_pct < 1.0:
            self.sum_kbps_ms = 0.0
            self.active_ms = 0.0
        elif progress < 100.0:
            self.sum_kbps_ms += throughput_kbps * dt_ms
            self.active_ms += dt_ms


def main():
    port = sys.argv[1] if len(sys.argv) > 1 else PORT

    print(f"HDT overnight throughput logger")
    print(f"  Port          : {port} @ {BAUD} baud")
    print(f"  Virtual file  : {FILE_SIZE_MB} MB")
    print(f"  PHY sequence  : {', '.join(PHY_LABELS[i] for i in ENABLED_PHYS)}")
    print(f"  Log folder    : {LOG_DIR}")
    print("  (Close the nRF Connect hdt-demo app; the COM port is exclusive.)")
    print()

    try:
        ser = serial.Serial(port, BAUD, timeout=0.05)
    except serial.SerialException as exc:
        print(f"ERROR: could not open {port}: {exc}", file=sys.stderr)
        return 1

    run_log = RunLog(LOG_DIR)
    print(f"Logging to {run_log.path}")

    buffer = bytearray()
    last_throughput = {phy: 0 for phy in ENABLED_PHYS}
    last_report_time = {phy: None for phy in ENABLED_PHYS}

    seq_pos = 0
    active_phy = ENABLED_PHYS[seq_pos]
    transfer = PhyTransfer()

    def start_phy(phy):
        nonlocal transfer
        last_throughput[phy] = 0
        last_report_time[phy] = None  # gate integration until a fresh report
        transfer = PhyTransfer()
        ser.write(build_config_command(phy).encode("ascii"))
        ser.flush()
        print(f"--> {PHY_LABELS[phy]}: starting {FILE_SIZE_MB} MB transfer")

    start_phy(active_phy)

    last_tick = time.monotonic()
    last_status = last_tick

    try:
        while True:
            data = ser.read(4096)
            now = time.monotonic()
            if data:
                buffer.extend(data)
                for phy, throughput in parse_frames(buffer):
                    if phy in last_throughput:
                        last_throughput[phy] = throughput
                        last_report_time[phy] = now

            dt_ms = (now - last_tick) * 1000.0
            last_tick = now

            # Effective throughput for the active PHY: 0 until a fresh report
            # arrives and 0 if reports have gone stale (dead link).
            reported_at = last_report_time[active_phy]
            if reported_at is None or (now - reported_at) > STALE_TIMEOUT_S:
                effective_kbps = 0
            else:
                effective_kbps = last_throughput[active_phy]

            transfer.tick(effective_kbps, dt_ms)

            if now - last_status >= STATUS_INTERVAL_S:
                last_status = now
                print(
                    f"    {PHY_LABELS[active_phy]:>6}  "
                    f"{transfer.progress_pct:5.1f}%  "
                    f"tp={effective_kbps:>4} kbps  "
                    f"avg={round(transfer.avg_kbps):>4} kbps  "
                    f"elapsed={transfer.elapsed_ms / 1000:8.1f}s"
                )

            if transfer.done:
                run_log.log_completion(
                    PHY_LABELS[active_phy],
                    effective_kbps,
                    transfer.avg_kbps,
                    transfer.elapsed_ms,
                )
                print(
                    f"<-- {PHY_LABELS[active_phy]}: done in "
                    f"{transfer.elapsed_ms / 1000:.1f}s "
                    f"(avg {round(transfer.avg_kbps)} kbps)"
                )
                seq_pos = (seq_pos + 1) % len(ENABLED_PHYS)
                active_phy = ENABLED_PHYS[seq_pos]
                start_phy(active_phy)
                last_tick = time.monotonic()
    except KeyboardInterrupt:
        print("\nStopping (Ctrl+C).")
    finally:
        run_log.close()
        try:
            ser.write(b"stop\r")
            ser.flush()
        except serial.SerialException:
            pass
        ser.close()
        print(f"Log saved to {run_log.path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
