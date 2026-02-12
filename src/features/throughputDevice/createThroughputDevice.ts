/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { SerialPort } from 'serialport';

export type RssiDevice = Awaited<ReturnType<typeof createRssiDevice>>;

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
    }) => {
        const { delay, phyEnabled } = options;

        const clampedDelay = Math.max(0, Math.min(10, delay));
        const delayHex = clampedDelay.toString(16).padStart(2, '0');

        const physMask = phyEnabled.reduce(
            (mask, enabled, index) => (enabled ? mask | (1 << index) : mask),
            0,
        );
        const physHex = physMask.toString(16).padStart(2, '0');

        const cmd = `set config delay=0x${delayHex} phys=0x${physHex}\r`;

        await writeAndDrain(cmd);
    };

    return {
        pauseReading,
        stopReading: async () => {
            await pauseReading();
        },
        writeConfig,
        toggleLED: () => writeAndDrain('led\r'),
        setLogger: (
            fn: (entry: { direction: 'tx' | 'rx'; data: string }) => void,
        ) => {
            logger = fn;
        },
    };
};
