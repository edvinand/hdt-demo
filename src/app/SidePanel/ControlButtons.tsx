/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    Button,
    selectedDevice,
    useHotKey,
} from '@nordicsemiconductor/pc-nrfconnect-shared';

import {
    applyCurrentPhyEnabled,
    applyEnableGraphOnSinglePhy,
    applyOneActivePhyEnabled,
    applyEnableProgressBars,
    applyEnableUartTerminal,
    applyVirtualFileSizeMb,
    clearOneActivePhySequence,
    getAppliedPhyEnabled,
    getConnectionIntervalUnits,
    getDelay,
    getIsConnected,
    getOneActivePhyCurrentIndex,
    getOneActivePhySequenceActive,
    getPendingOneActivePhyEnabled,
    getPacketSizeBytes,
    getPendingVirtualFileSizeMb,
    getPhyEnabled,
    getRssiDevice,
    getVirtualFileSizeMb,
    initializeOneActivePhySequence,
    loadDefaultConfig,
    setIsPaused,
} from '../../features/throughputDevice/throughputDeviceSlice';

export default () => {
    const dispatch = useDispatch();

    const loadDefaults = useCallback(() => {
        dispatch(loadDefaultConfig());
    }, [dispatch]);

    useHotKey({
        hotKey: 'alt+d',
        title: 'Load default config',
        isGlobal: false,
        action: () => loadDefaults(),
    });

    return (
        <Button variant="secondary" className="w-100" onClick={loadDefaults}>
            Load default config
        </Button>
    );
};

export const WriteConfigButton = () => {
    const isConnected = useSelector(getIsConnected);
    const delay = useSelector(getDelay);
    const phyEnabled = useSelector(getPhyEnabled);
    // eslint-disable-next-line no-underscore-dangle
    const _virtualFileSizeMb = useSelector(getVirtualFileSizeMb);
    const pendingVirtualFileSizeMb = useSelector(getPendingVirtualFileSizeMb);
    const connectionIntervalUnits = useSelector(getConnectionIntervalUnits);
    const packetSizeBytes = useSelector(getPacketSizeBytes);
    const pendingOneActivePhyEnabled = useSelector(
        getPendingOneActivePhyEnabled,
    );
    const appliedPhyEnabled = useSelector(getAppliedPhyEnabled);
    const oneActivePhyCurrentIndex = useSelector(getOneActivePhyCurrentIndex);
    const oneActivePhySequenceActive = useSelector(getOneActivePhySequenceActive);
    const rssiDevice = useSelector(getRssiDevice);
    const device = useSelector(selectedDevice);
    const dispatch = useDispatch();
    const [hasStarted, setHasStarted] = useState(false);
    const [wasStopped, setWasStopped] = useState(false);

    const isPca10056 =
        device?.devkit?.boardVersion?.toUpperCase() === 'PCA10056';

    const writeConfig = useCallback(() => {
        if (!isConnected) return;

        const effectivePhyEnabled = phyEnabled.map((v, i) =>
            isPca10056 && i < 5 ? false : v,
        );

        const firstActivePhyIndex = effectivePhyEnabled.findIndex(
            enabled => enabled,
        );
        const oneActiveStartMask = effectivePhyEnabled.map(
            (enabled, index) => enabled && index === firstActivePhyIndex,
        );

        const shouldResumeOneActiveSequence =
            pendingOneActivePhyEnabled &&
            wasStopped &&
            oneActivePhySequenceActive &&
            oneActivePhyCurrentIndex >= 0;

        const phyMaskForWrite = pendingOneActivePhyEnabled
            ? shouldResumeOneActiveSequence
                ? appliedPhyEnabled
                : oneActiveStartMask
            : effectivePhyEnabled;

        dispatch(setIsPaused(false));
        dispatch(applyVirtualFileSizeMb());
        dispatch(applyEnableGraphOnSinglePhy());
        dispatch(applyEnableProgressBars());
        dispatch(applyEnableUartTerminal());
        dispatch(applyOneActivePhyEnabled());

        if (pendingOneActivePhyEnabled) {
            if (!shouldResumeOneActiveSequence) {
                dispatch(initializeOneActivePhySequence(effectivePhyEnabled));
            }
        } else {
            dispatch(clearOneActivePhySequence());
            dispatch(applyCurrentPhyEnabled());
        }

        rssiDevice?.writeConfig({
            delay,
            phyEnabled: phyMaskForWrite,
            virtualFileSizeMb: pendingVirtualFileSizeMb,
            connectionIntervalUnits,
            packetSizeBytes,
        });

        setHasStarted(true);
        setWasStopped(false);
    }, [
        appliedPhyEnabled,
        connectionIntervalUnits,
        delay,
        dispatch,
        isConnected,
        isPca10056,
        oneActivePhyCurrentIndex,
        oneActivePhySequenceActive,
        packetSizeBytes,
        pendingOneActivePhyEnabled,
        pendingVirtualFileSizeMb,
        phyEnabled,
        rssiDevice,
        wasStopped,
    ]);

    const stopAndFreeze = useCallback(() => {
        dispatch(setIsPaused(true));
        setWasStopped(true);
    }, [dispatch]);

    const startButtonLabel = !hasStarted
        ? 'Start'
                : wasStopped
                    ? 'Start'
                    : 'Restart';

    useHotKey({
        hotKey: 'alt+w',
        title: 'Start or restart',
        isGlobal: false,
        action: () => writeConfig(),
    });

    return (
        <>
            <Button
                variant="primary"
                className="w-100"
                disabled={!isConnected}
                onClick={writeConfig}
            >
                {startButtonLabel}
            </Button>
            {hasStarted && !wasStopped && (
                <Button
                    variant="secondary"
                    className="w-100 tw-mt-2"
                    disabled={!isConnected}
                    onClick={stopAndFreeze}
                >
                    Stop
                </Button>
            )}
        </>
    );
};
