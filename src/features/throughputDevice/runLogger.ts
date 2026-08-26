/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { getAppDir, logger } from '@nordicsemiconductor/pc-nrfconnect-shared';
import fs from 'fs';
import path from 'path';

interface RunLogConfig {
    virtualFileSizeMb: number;
    connectionIntervalUnits: number;
    packetSizeBytes: number;
    delay: number;
}

interface PhyCompletion {
    phyName: string;
    virtualFileSizeMb: number;
    throughputKbps: number;
    avgThroughputKbps: number;
    transferMs: number;
}

let fd: number | null = null;
let currentPath: string | null = null;

const pad = (n: number) => String(n).padStart(2, '0');

// Filesystem-safe timestamp used in the log file name.
const fileTimestamp = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

// Local ISO-8601 timestamp (with UTC offset) so time-of-day is preserved.
const lineTimestamp = (d: Date) => {
    const tzMinutes = -d.getTimezoneOffset();
    const sign = tzMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(tzMinutes);
    const offset = `${sign}${pad(Math.floor(absMinutes / 60))}:${pad(
        absMinutes % 60,
    )}`;
    return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
        offset
    );
};

// Write a full line and flush to disk so that a hard stop can at most corrupt
// the line currently being written, never any previously completed line.
const writeLine = (line: string) => {
    if (fd === null) return;
    try {
        fs.writeSync(fd, `${line}\n`);
        fs.fsyncSync(fd);
    } catch (error) {
        logger.error(`Failed to write run log line: ${error}`);
    }
};

export const startRunLog = (config: RunLogConfig) => {
    stopRunLog();

    try {
        const dir = path.join(getAppDir(), 'logs');
        fs.mkdirSync(dir, { recursive: true });

        const created = new Date();
        currentPath = path.join(dir, `hdt-run-${fileTimestamp(created)}.txt`);
        fd = fs.openSync(currentPath, 'a');

        writeLine(`# HDT throughput run started ${lineTimestamp(created)}`);
        writeLine(
            `# config: virtual_file_size_mb=${config.virtualFileSizeMb} ` +
                `conn_interval_units=${config.connectionIntervalUnits} ` +
                `packet_size_bytes=${config.packetSizeBytes} ` +
                `delay=${config.delay}`,
        );
        writeLine(
            'timestamp,phy,virtual_file_size_mb,throughput_kbps,' +
                'avg_throughput_kbps,transfer_time_ms',
        );

        logger.info(`Logging throughput run to ${currentPath}`);
    } catch (error) {
        logger.error(`Failed to start run log: ${error}`);
        fd = null;
        currentPath = null;
    }
};

export const logPhyCompletion = ({
    phyName,
    virtualFileSizeMb,
    throughputKbps,
    avgThroughputKbps,
    transferMs,
}: PhyCompletion) => {
    if (fd === null) return;
    writeLine(
        `${lineTimestamp(new Date())},${phyName},${virtualFileSizeMb},` +
            `${Math.round(throughputKbps)},${Math.round(avgThroughputKbps)},` +
            `${Math.round(transferMs)}`,
    );
};

export const stopRunLog = () => {
    if (fd === null) return;
    try {
        fs.closeSync(fd);
    } catch (error) {
        logger.error(`Failed to close run log: ${error}`);
    }
    fd = null;
    currentPath = null;
};

export const isRunLogActive = () => fd !== null;
