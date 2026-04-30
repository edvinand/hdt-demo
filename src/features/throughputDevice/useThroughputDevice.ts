/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    AppThunk,
    getReadbackProtection,
    logger,
} from '@nordicsemiconductor/pc-nrfconnect-shared';

import { createRssiDevice } from './createThroughputDevice';
import {
    clearRssiData,
    getSerialPort,
    logUart,
    onReceiveNoRssiData,
    onReceiveRssiData,
    resetIsPhyFrozen,
    resetRssiStore,
    setRssiDevice,
} from './throughputDeviceSlice';

export default () => {
    const dispatch = useDispatch();
    const serialPort = useSelector(getSerialPort);

    useEffect(() => {
        if (serialPort) {
            const device = createRssiDevice(serialPort);
            dispatch(setRssiDevice(device));

            device.setLogger(entry => {
                dispatch(
                    logUart({
                        direction: entry.direction,
                        text: entry.data,
                    }),
                );
            });

            dispatch(resetRssiStore());

            let noDataTimeout: NodeJS.Timeout;
            dispatch<AppThunk>((_, getState) => {
                noDataTimeout = setTimeout(() => {
                    if (
                        getReadbackProtection(getState()) !==
                        'NRFDL_PROTECTION_STATUS_NONE'
                    ) {
                        dispatch(onReceiveNoRssiData());
                    }
                }, 3000);
            });

            serialPort.on('data', data => {
                clearTimeout(noDataTimeout);
                dispatch(onReceiveRssiData(data));

                if ((data as Buffer).includes(Buffer.from('$$'))) {
                    dispatch(resetIsPhyFrozen());
                }

                const hex = Array.from(data as Buffer)
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join(' ');
                dispatch(logUart({ direction: 'rx', text: hex }));
            });
            serialPort.on('error', console.log);

            serialPort.on('close', () => {
                logger.info(`Serial Port ${serialPort.path} has been closed`);
                dispatch(clearRssiData());
            });

            return () => {
                if (serialPort.isOpen) {
                    device.stopReading();
                    logger.info(`Stop RSSI Device`);
                    serialPort.close();
                    logger.info(`Closing Serial Port ${serialPort.path}`);
                }
            };
        }
    }, [dispatch, serialPort]);
};
