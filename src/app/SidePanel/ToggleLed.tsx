/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import { useSelector } from 'react-redux';
import {
    type Device,
    Button,
    Overlay,
    getDevices,
    selectedDevice,
} from '@nordicsemiconductor/pc-nrfconnect-shared';

import {
    getIsConnected,
    getRssiDevice,
    getCompanionTargetSerial,
} from '../../features/throughputDevice/throughputDeviceSlice';
import type { RssiDevice } from '../../features/throughputDevice/createThroughputDevice';

export default () => {
    const isConnected = useSelector(getIsConnected);
    const rssiDevice = useSelector(getRssiDevice) as RssiDevice | undefined;
    const device = useSelector(selectedDevice) as Device | undefined;
    const companionTargetSerial = useSelector(getCompanionTargetSerial);
    const connectedDevices = useSelector(getDevices);
    const mainBoardVersion = device?.devkit?.boardVersion?.toUpperCase();
    const serialLedName = mainBoardVersion === 'PCA10056' ? 'LED3' : 'LED2';
    const remoteDevice = connectedDevices.find(
        connectedDevice => connectedDevice.serialNumber === companionTargetSerial,
    );
    const remoteBoardVersion =
        remoteDevice?.devkit?.boardVersion?.toUpperCase() ??
        (connectedDevices.length === 1 && mainBoardVersion === 'PCA10056'
            ? 'PCA10056'
            : undefined);
    const remoteLedName =
        remoteBoardVersion === 'PCA10056' ? 'LED3' : 'LED2';
    const onToggleSerialLed = () => rssiDevice?.sendUartCommand('led0');
    const onToggleRemoteLed = () => rssiDevice?.sendUartCommand('led1');

    return (
        <>
            <Overlay
                tooltipId="toggle-led-serial-tooltip"
                tooltipChildren={
                    <p>
                        Toggle {serialLedName} on the device connected via
                        serial. Used to see what device that acts as the
                        peripheral device.
                    </p>
                }
                placement="right"
            >
                <Button
                    variant="secondary"
                    className="w-100"
                    disabled={!isConnected}
                    onClick={onToggleSerialLed}
                >
                    Toggle LED serial device
                </Button>
            </Overlay>
            <Overlay
                tooltipId="toggle-led-remote-tooltip"
                tooltipChildren={
                    <p>
                        Toggle {remoteLedName} on the remote device connected
                        via BLE. Used to see what device you are connected to
                        (if any).
                    </p>
                }
                placement="right"
            >
                <Button
                    variant="secondary"
                    className="w-100 tw-mt-2"
                    disabled={!isConnected}
                    onClick={onToggleRemoteLed}
                >
                    Toggle LED remote device
                </Button>
            </Overlay>
        </>
    );
};
