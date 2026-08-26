/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    Button,
    NumberInput,
    Overlay,
    Toggle,
} from '@nordicsemiconductor/pc-nrfconnect-shared';

import {
    getConnectionIntervalUnits,
    getIsConnected,
    getIsPhyFrozen,
    getPacketSizeBytes,
    getPendingEnableGraphOnSinglePhy,
    getPendingOneActivePhyEnabled,
    getPendingEnableProgressBars,
    getPendingEnableUartTerminal,
    getPendingLogToFile,
    getPendingShowAverageThroughput,
    getPendingShowLiveThroughput,
    getPendingVirtualFileSizeMb,
    getRssiDevice,
    setConnectionIntervalUnits,
    setEnableGraphOnSinglePhy,
    setEnableProgressBars,
    setEnableUartTerminal,
    setLogToFile,
    setShowAverageThroughput,
    setShowLiveThroughput,
    setOneActivePhyEnabled,
    setIsPhyFrozen,
    setPacketSizeBytes,
    setPendingVirtualFileSizeMb,
} from '../../features/throughputDevice/throughputDeviceSlice';
import Delay from './Delay';
import ToggleLed from './ToggleLed';

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

const unitsToMs = (units: number) => units * 1.25;
const msToUnits = (ms: number) => Math.round(ms / 1.25);

export default () => {
    const dispatch = useDispatch();
    const pendingVirtualFileSizeMb = useSelector(getPendingVirtualFileSizeMb);
    const connectionIntervalUnits = useSelector(getConnectionIntervalUnits);
    const packetSizeBytes = useSelector(getPacketSizeBytes);
    const isConnected = useSelector(getIsConnected);
    const isPhyFrozen = useSelector(getIsPhyFrozen);
    const rssiDevice = useSelector(getRssiDevice);
    const enableGraphOnSinglePhy = useSelector(
        getPendingEnableGraphOnSinglePhy,
    );
    const oneActivePhyEnabled = useSelector(getPendingOneActivePhyEnabled);
    const enableProgressBars = useSelector(getPendingEnableProgressBars);
    const enableUartTerminal = useSelector(getPendingEnableUartTerminal);
    const showAverageThroughput = useSelector(getPendingShowAverageThroughput);
    const showLiveThroughput = useSelector(getPendingShowLiveThroughput);
    const logToFile = useSelector(getPendingLogToFile);
    const [isFreezeCommandInFlight, setIsFreezeCommandInFlight] =
        useState(false);

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
            dispatch(setPacketSizeBytes(clamp(value, 23, 498)));
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

    const setEnableProgress = useCallback(
        (enabled: boolean) => {
            dispatch(setEnableProgressBars(enabled));
        },
        [dispatch],
    );

    const setOneActivePhy = useCallback(
        (enabled: boolean) => {
            dispatch(setOneActivePhyEnabled(enabled));
        },
        [dispatch],
    );

    const setShowAverage = useCallback(
        (enabled: boolean) => {
            dispatch(setShowAverageThroughput(enabled));
        },
        [dispatch],
    );

    const setShowLive = useCallback(
        (enabled: boolean) => {
            dispatch(setShowLiveThroughput(enabled));
        },
        [dispatch],
    );

    const setLogToFileEnabled = useCallback(
        (enabled: boolean) => {
            dispatch(setLogToFile(enabled));
        },
        [dispatch],
    );

    const onToggleFreezePhy = useCallback(async () => {
        if (!rssiDevice || isFreezeCommandInFlight) return;

        setIsFreezeCommandInFlight(true);
        try {
            if (isPhyFrozen) {
                await rssiDevice.unfreezePhy();
                dispatch(setIsPhyFrozen(false));
            } else {
                await rssiDevice.freezePhy();
                dispatch(setIsPhyFrozen(true));
            }
        } finally {
            setIsFreezeCommandInFlight(false);
        }
    }, [dispatch, isFreezeCommandInFlight, isPhyFrozen, rssiDevice]);

    return (
        <>
            <Overlay
                tooltipId="virtual-file-size-tooltip"
                tooltipChildren={
                    <p>
                        The size of the virtual file that is being transferred.
                        This is not actually a file being transferred, but used
                        as a measurement to see how long it would take to
                        transfer a file of this size.
                    </p>
                }
                placement="right"
            >
                <NumberInput
                    showSlider
                    minWidth
                    range={{ min: 1, max: 100, step: 1, decimals: 2 }}
                    value={pendingVirtualFileSizeMb}
                    onChange={setFileSize}
                    label="Virtual file size"
                    unit="MB"
                />
            </Overlay>
            <NumberInput
                showSlider
                minWidth
                range={{ min: 7.5, max: 500 }}
                value={unitsToMs(connectionIntervalUnits)}
                onChange={setConnectionIntervalMs}
                label="Connection interval"
                unit="ms"
            />
            <Overlay
                tooltipId="packet-size-tooltip"
                tooltipChildren={
                    <p>
                        The size of the payload packets. The actual MTU is
                        fixed in this demo.
                    </p>
                }
                placement="right"
            >
                <NumberInput
                    showSlider
                    minWidth
                    range={{ min: 23, max: 498 }}
                    value={packetSizeBytes}
                    onChange={setPacketSize}
                    label="Packet size"
                    unit="Bytes"
                />
            </Overlay>
            <Delay />
            <div className="tw-mt-2">
                <Overlay
                    tooltipId="enable-graph-tooltip"
                    tooltipChildren={
                        <p>
                            When only one PHY is active, you can see the
                            throughput history plotted in a graph.
                        </p>
                    }
                    placement="right"
                >
                    <Toggle
                        isToggled={enableGraphOnSinglePhy}
                        onToggle={setEnableGraph}
                    >
                        Enable graph on single PHY
                    </Toggle>
                </Overlay>
            </div>
            <div className="tw-mt-2">
                <Overlay
                    tooltipId="enable-progress-tooltip"
                    tooltipChildren={
                        <p>
                            Show the transfer of the virtual file in
                            realtime.
                        </p>
                    }
                    placement="right"
                >
                    <Toggle
                        isToggled={enableProgressBars}
                        onToggle={setEnableProgress}
                    >
                        Enable progress bars
                    </Toggle>
                </Overlay>
            </div>
            <div className="tw-mt-2">
                <Overlay
                    tooltipId="one-active-phy-tooltip"
                    tooltipChildren={
                        <p>
                            When enabled, the device will remain on a single
                            PHY until the entire virtual file is transferred
                            before moving on to the next active PHY.
                        </p>
                    }
                    placement="right"
                >
                    <Toggle
                        isToggled={oneActivePhyEnabled}
                        onToggle={setOneActivePhy}
                    >
                        Round Robin
                    </Toggle>
                </Overlay>
            </div>
            <div className="tw-mt-2">
                <Overlay
                    tooltipId="show-average-throughput-tooltip"
                    tooltipChildren={
                        <p>
                            Show average throughput for the ongoing file transfer.
                        </p>
                    }
                    placement="right"
                >
                    <Toggle
                        isToggled={showAverageThroughput}
                        onToggle={setShowAverage}
                    >
                        Show average throughput
                    </Toggle>
                </Overlay>
            </div>
            <div className="tw-mt-2">
                <Overlay
                    tooltipId="show-live-throughput-tooltip"
                    tooltipChildren={
                        <p>
                            Show a timeline of the current throughput over the
                            last 60 seconds below the bars, including while the
                            demo cycles between PHYs.
                        </p>
                    }
                    placement="right"
                >
                    <Toggle
                        isToggled={showLiveThroughput}
                        onToggle={setShowLive}
                    >
                        Show live throughput
                    </Toggle>
                </Overlay>
            </div>
            <div className="tw-mt-2">
                <Overlay
                    tooltipId="enable-uart-tooltip"
                    tooltipChildren={
                        <p>
                            Show UART terminal. Used for debugging.
                        </p>
                    }
                    placement="right"
                >
                    <Toggle
                        isToggled={enableUartTerminal}
                        onToggle={setEnableTerminal}
                    >
                        Enable UART terminal
                    </Toggle>
                </Overlay>
            </div>
            <div className="tw-mt-2">
                <Overlay
                    tooltipId="log-to-file-tooltip"
                    tooltipChildren={
                        <p>
                            When enabled, each completed virtual file transfer
                            is appended to a timestamped log file in the app's
                            &quot;logs&quot; folder. A new file is created every
                            time you press Send.
                        </p>
                    }
                    placement="right"
                >
                    <Toggle
                        isToggled={logToFile}
                        onToggle={setLogToFileEnabled}
                    >
                        Log to file
                    </Toggle>
                </Overlay>
            </div>
            <div className="tw-mt-2">
                <Overlay
                    tooltipId="freeze-phy-tooltip"
                    tooltipChildren={
                        <p>
                            The demo will continue, but it will remain on the
                            currently active PHY until you unfreeze.
                        </p>
                    }
                    placement="right"
                >
                    <Button
                        variant="secondary"
                        className="w-100"
                        disabled={!isConnected || isFreezeCommandInFlight}
                        onClick={() => {
                            onToggleFreezePhy();
                        }}
                    >
                        {isPhyFrozen ? 'Unfreeze PHY' : 'Freeze PHY'}
                    </Button>
                </Overlay>
            </div>
            <div className="tw-mt-2">
                <ToggleLed />
            </div>
        </>
    );
};
