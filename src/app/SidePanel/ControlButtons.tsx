/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, useHotKey } from '@nordicsemiconductor/pc-nrfconnect-shared';

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
    const dispatch = useDispatch();

    const writeConfig = useCallback(() => {
        if (!isConnected) return;

        dispatch(applyVirtualFileSizeMb());
        dispatch(applyEnableGraphOnSinglePhy());
        rssiDevice?.writeConfig({
            delay,
            phyEnabled,
            virtualFileSizeMb: pendingVirtualFileSizeMb,
            connectionIntervalUnits,
            packetSizeBytes,
        });
        dispatch(applyCurrentPhyEnabled());
    }, [
        delay,
        dispatch,
        isConnected,
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
