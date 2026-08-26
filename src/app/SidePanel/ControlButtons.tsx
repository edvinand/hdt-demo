/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, useHotKey } from '@nordicsemiconductor/pc-nrfconnect-shared';

import {
    getIsConnected,
    getHasStarted,
    loadDefaultConfig,
    markDemoStopped,
    setIsPaused,
    getWasStopped,
} from '../../features/throughputDevice/throughputDeviceSlice';
import { writeCurrentConfigToDevice } from '../../features/throughputDevice/throughputDeviceEffects';
import { stopRunLog } from '../../features/throughputDevice/runLogger';

export default () => {
    const dispatch = useDispatch();
    const hasStarted = useSelector(getHasStarted);
    const wasStopped = useSelector(getWasStopped);

    const loadDefaults = useCallback(() => {
        dispatch(loadDefaultConfig());
        if (hasStarted && !wasStopped) {
            dispatch(writeCurrentConfigToDevice());
        }
    }, [dispatch, hasStarted, wasStopped]);

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
    const hasStarted = useSelector(getHasStarted);
    const wasStopped = useSelector(getWasStopped);
    const dispatch = useDispatch();
    const writeConfig = useCallback(() => {
        if (!isConnected) return;
        dispatch(writeCurrentConfigToDevice());
    }, [dispatch, isConnected]);

    const stopAndFreeze = useCallback(() => {
        stopRunLog();
        dispatch(setIsPaused(true));
        dispatch(markDemoStopped());
    }, [dispatch]);

    const startButtonLabel = 'Send';

    useHotKey({
        hotKey: 'alt+w',
        title: 'Send',
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
