/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { Button, Overlay } from '@nordicsemiconductor/pc-nrfconnect-shared';

import {
    getIsConnected,
    getRssiDevice,
} from '../../features/throughputDevice/throughputDeviceSlice';

export default () => {
    const isConnected = useSelector(getIsConnected);
    const rssiDevice = useSelector(getRssiDevice);
    const onToggleSerialLed = () => rssiDevice?.sendUartCommand('led0');
    const onToggleRemoteLed = () => rssiDevice?.sendUartCommand('led1');

    return (
        <>
            <Overlay
                tooltipId="toggle-led-serial-tooltip"
                tooltipChildren={
                    <p>
                        Toggle the LED on the device connected via serial.
                        Used to see what device that acts as the peripheral
                        device.
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
                        Toggle the LED on the remote device connected via BLE.
                        Used to see what device you are connected to (if any).
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
