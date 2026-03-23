/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    Button,
    selectedDevice,
    useHotKey,
} from '@nordicsemiconductor/pc-nrfconnect-shared';

import {
    getDelay,
    getIsConnected,
    getRssiDevice,
    getPhyEnabled,
    getVirtualFileSizeMb,
    getPendingVirtualFileSizeMb,
    getConnectionIntervalUnits,
    getPacketSizeBytes,
    loadDefaultConfig,
    applyCurrentPhyEnabled,
    applyVirtualFileSizeMb,
    applyEnableGraphOnSinglePhy,
    applyEnableUartTerminal,
} from '../../features/throughputDevice/throughputDeviceSlice';

export default () => {
    const isConnected = useSelector(getIsConnected);
    const delay = useSelector(getDelay);
    const phyEnabled = useSelector(getPhyEnabled);
    const virtualFileSizeMb = useSelector(getVirtualFileSizeMb);
    const pendingVirtualFileSizeMb = useSelector(getPendingVirtualFileSizeMb);
    const connectionIntervalUnits = useSelector(getConnectionIntervalUnits);
    const packetSizeBytes = useSelector(getPacketSizeBytes);
    const rssiDevice = useSelector(getRssiDevice);
    const device = useSelector(selectedDevice);
    const dispatch = useDispatch();

    const isPca10056 =
        device?.devkit?.boardVersion?.toUpperCase() === 'PCA10056';

    const writeConfig = useCallback(() => {
        if (!isConnected) return;

        // For PCA10056, force HDT PHY indices 0-4 to false; only LE 2M/LE 1M are supported.
        const effectivePhyEnabled = phyEnabled.map((v, i) =>
            isPca10056 && i < 5 ? false : v,
        );

        dispatch(applyVirtualFileSizeMb());
        dispatch(applyEnableGraphOnSinglePhy());
        dispatch(applyEnableUartTerminal());
        rssiDevice?.writeConfig({
            delay,
            phyEnabled: effectivePhyEnabled,
            virtualFileSizeMb: pendingVirtualFileSizeMb,
            connectionIntervalUnits,
            packetSizeBytes,
        });
        dispatch(applyCurrentPhyEnabled());
    }, [
        delay,
        dispatch,
        isConnected,
        isPca10056,
        phyEnabled,
        rssiDevice,
        pendingVirtualFileSizeMb,
        connectionIntervalUnits,
        packetSizeBytes,
    ]);

    const loadDefaults = useCallback(() => {
        dispatch(loadDefaultConfig());
    }, [dispatch]);

    useHotKey({
        hotKey: 'alt+w',
        title: 'Write config',
        isGlobal: false,
        action: () => writeConfig(),
    });

    useHotKey({
        hotKey: 'alt+d',
        title: 'Load default config',
        isGlobal: false,
        action: () => loadDefaults(),
    });

    return (
        <>
            <Button
                variant="primary"
                className="w-100 tw-mb-2"
                disabled={!isConnected}
                onClick={writeConfig}
            >
                Write config
            </Button>

            <Button
                variant="secondary"
                className="w-100"
                onClick={loadDefaults}
            >
                Load default config
            </Button>
        </>
    );
};
