/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    NumberInput,
    Toggle,
} from '@nordicsemiconductor/pc-nrfconnect-shared';

import {
    getConnectionIntervalUnits,
    getPendingEnableGraphOnSinglePhy,
    getPendingEnableUartTerminal,
    getPacketSizeBytes,
    getPendingVirtualFileSizeMb,
    setConnectionIntervalUnits,
    setEnableGraphOnSinglePhy,
    setEnableUartTerminal,
    setPacketSizeBytes,
    setPendingVirtualFileSizeMb,
} from '../../features/throughputDevice/throughputDeviceSlice';

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

const unitsToMs = (units: number) => units * 1.25;
const msToUnits = (ms: number) => Math.round(ms / 1.25);

export default () => {
    const dispatch = useDispatch();
    const pendingVirtualFileSizeMb = useSelector(getPendingVirtualFileSizeMb);
    const connectionIntervalUnits = useSelector(getConnectionIntervalUnits);
    const packetSizeBytes = useSelector(getPacketSizeBytes);
    const enableGraphOnSinglePhy = useSelector(getPendingEnableGraphOnSinglePhy);
    const enableUartTerminal = useSelector(getPendingEnableUartTerminal);

    const setFileSize = useCallback(
        (value: number) => {
            dispatch(setPendingVirtualFileSizeMb(clamp(value, 1, 100)));
        },
        [dispatch],
    );

    const setConnectionIntervalMs = useCallback(
        (value: number) => {
            const units = clamp(msToUnits(value), 6, 400);
            dispatch(setConnectionIntervalUnits(units));
        },
        [dispatch],
    );

    const setPacketSize = useCallback(
        (value: number) => {
            dispatch(setPacketSizeBytes(clamp(value, 23, 247)));
        },
        [dispatch],
    );

    const setEnableGraph = useCallback(
        (enabled: boolean) => {
            dispatch(setEnableGraphOnSinglePhy(enabled));
        },
        [dispatch],
    );

    const setEnableTerminal = useCallback(
        (enabled: boolean) => {
            dispatch(setEnableUartTerminal(enabled));
        },
        [dispatch],
    );

    return (
        <>
            <NumberInput
                showSlider
                minWidth
                range={{ min: 1, max: 100 }}
                value={pendingVirtualFileSizeMb}
                onChange={setFileSize}
                label="Virtual file size"
                unit="MB"
            />
            <NumberInput
                showSlider
                minWidth
                range={{ min: 7.5, max: 500 }}
                value={unitsToMs(connectionIntervalUnits)}
                onChange={setConnectionIntervalMs}
                label="Connection interval"
                unit="ms"
            />
            <NumberInput
                showSlider
                minWidth
                range={{ min: 23, max: 247 }}
                value={packetSizeBytes}
                onChange={setPacketSize}
                label="Packet size"
                unit="B"
            />
            <div className="tw-mt-2">
                <Toggle
                    isToggled={enableGraphOnSinglePhy}
                    onToggle={setEnableGraph}
                >
                    Enable graph on single PHY
                </Toggle>
            </div>
            <div className="tw-mt-2">
                <Toggle
                    isToggled={enableUartTerminal}
                    onToggle={setEnableTerminal}
                >
                    Enable UART terminal
                </Toggle>
            </div>
        </>
    );
};
