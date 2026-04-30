/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { SerialPort } from 'serialport';

export type RssiDevice = Awaited<ReturnType<typeof createRssiDevice>>;

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

export const createRssiDevice = (serialPort: SerialPort) => {
    let logger:
        | ((entry: { direction: 'tx' | 'rx'; data: string }) => void)
        | undefined;

    const writeAndDrain = async (cmd: string) => {
        if (logger) {
            logger({ direction: 'tx', data: cmd.replace(/\r?\n?$/, '') });
        }
        await new Promise(resolve => {
            serialPort.write(cmd, () => {
                serialPort.drain(resolve);
            });
        });
    };

    const pauseReading = () => writeAndDrain('stop\r');

    const writeConfig = async (options: {
        delay: number;
        phyEnabled: boolean[];
        virtualFileSizeMb: number;
        connectionIntervalUnits: number;
        packetSizeBytes: number;
    }) => {
        const {
            delay,
            phyEnabled,
            virtualFileSizeMb,
            connectionIntervalUnits,
            packetSizeBytes,
        } = options;

        const clampedDelay = clamp(delay, 0, 10);
        const delayHex = clampedDelay.toString(16).padStart(2, '0');

        const physMask = phyEnabled.reduce(
            // eslint-disable-next-line no-bitwise
            (mask, enabled, index) => (enabled ? mask | (1 << index) : mask),
            0,
        );
        const physHex = physMask.toString(16).padStart(2, '0');

        const fileSizeHex = clamp(virtualFileSizeMb, 1, 100)
            .toString(16)
            .padStart(4, '0');
        const intervalHex = clamp(connectionIntervalUnits, 6, 400)
            .toString(16)
            .padStart(4, '0');
        const packetSizeHex = clamp(packetSizeBytes, 23, 247)
            .toString(16)
            .padStart(4, '0');

        const cmd =
            `$$d${delayHex},p${physHex},f${fileSizeHex},` +
            `i${intervalHex},m${packetSizeHex}\r`;

        await writeAndDrain(cmd);
    };

    const sendUartCommand = (cmd: string) => {
        // Trim whitespace and append CR if not already present
        const trimmed = cmd.trim();
        if (!trimmed) return Promise.resolve(); // Silently ignore empty commands
        const cmdWithCr = trimmed.endsWith('\r') ? trimmed : `${trimmed}\r`;
        return writeAndDrain(cmdWithCr);
    };

    return {
        pauseReading,
        stopReading: async () => {
            await pauseReading();
        },
        writeConfig,
        toggleLED: () => writeAndDrain('led\r'),
        freezePhy: () => writeAndDrain('freeze\r'),
        unfreezePhy: () => writeAndDrain('unfreeze\r'),
        sendUartCommand,
        setLogger: (
            fn: (entry: { direction: 'tx' | 'rx'; data: string }) => void,
        ) => {
            logger = fn;
        },
    };
};
