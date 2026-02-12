/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import {
    AppThunk,
    Device,
    DeviceSetupConfig,
    getAppFile,
    isDeviceInDFUBootloader,
    jprogDeviceSetup,
    logger,
    prepareDevice,
    sdfuDeviceSetup,
} from '@nordicsemiconductor/pc-nrfconnect-shared';
import { SerialPort } from 'serialport';

import { clearSerialPort, setSerialPort } from './throughputDeviceSlice';

export const deviceSetupConfig: DeviceSetupConfig = {
    deviceSetups: [
        sdfuDeviceSetup(
            [
                {
                    key: 'pca10059',
                    application: getAppFile('fw/rssi-10059.hex'),
                    semver: 'rssi_cdc_acm 2.0.0+dfuMay-22-2018-10-43-22',
                    params: {},
                },
            ],
            true,
            d =>
                !isDeviceInDFUBootloader(d) &&
                !!d.serialPorts &&
                d.serialPorts.length > 0 &&
                !!d.traits.nordicUsb &&
                !!d.usb &&
                d.usb.device.descriptor.idProduct === 0xc00a,
        ),
        jprogDeviceSetup(
            [
                {
                    key: 'nrf52_family',
                    fw: getAppFile('fw/rssi-10040.hex'),
                    fwVersion: 'rssi-fw-1.0.0',
                    fwIdAddress: 0x2000,
                },
                {
                    key: 'PCA10156',
                    fw: getAppFile('fw/blinky-10156.hex'),
                    fwVersion: 'blinky-10156',
                    fwIdAddress: 0x0,
                },
            ],
            true,
            true,
        ),
    ],
};

export const closeDevice = (): AppThunk => dispatch => {
    dispatch(clearSerialPort());
};

export const openDevice =
    (device: Device): AppThunk =>
    dispatch => {
        // Reset serial port settings
        const ports = device.serialPorts;

        if (ports && ports.length > 0) {
            // Prefer VCOM1 (index 1) when available, otherwise fall back to VCOM0 (index 0)
            const portIndex = ports.length > 1 ? 1 : 0;
            const comPort = ports[portIndex].comName;
            if (comPort) {
                logger.info(`Opening Serial port ${comPort}`);
                const serialPort = new SerialPort(
                    { path: comPort, baudRate: 115200 },
                    error => {
                        if (error) {
                            logger.error(
                                `Failed to open serial port ${comPort}.`,
                            );
                            logger.error(`Error ${error}.`);
                            return;
                        }

                        dispatch(setSerialPort(serialPort));
                        logger.info(`Serial Port ${comPort} has been opened`);
                    },
                );
            }
        }
    };

export const setupDeviceAndOpen =
    (device: Device): AppThunk =>
    dispatch => {
        const family = device.devkit?.deviceFamily?.toLowerCase() ?? '';
        const boardVersion =
            device.devkit?.boardVersion?.toUpperCase() ?? '';

        const isNrf54Family = family.includes('nrf54');
        const isNrf54Board =
            boardVersion === 'PCA10156' ||
            boardVersion === 'PCA10175' ||
            boardVersion === 'PCA10184' ||
            boardVersion === 'PCA10188';

        if (isNrf54Family || isNrf54Board) {
            logger.info(
                'Detected nRF54-family device. Skipping firmware version check and offering to program blinky firmware.',
            );
            const checkCurrentFirmwareVersion = false;
            const requireUserConfirmation = true;

            return dispatch(
                prepareDevice(
                    device,
                    deviceSetupConfig,
                    programmedDevice => {
                        dispatch(openDevice(programmedDevice));
                    },
                    reason => {
                        if (reason) {
                            logger.error('Device setup failed.', reason);
                        }
                    },
                    undefined,
                    checkCurrentFirmwareVersion,
                    requireUserConfirmation,
                ),
            );
        }

        const checkCurrentFirmwareVersion = true;
        const requireUserConfirmation = true;

        return dispatch(
            prepareDevice(
                device,
                deviceSetupConfig,
                programmedDevice => {
                    dispatch(openDevice(programmedDevice));
                },
                reason => {
                    if (reason) {
                        logger.error('Device setup failed.', reason);
                    }
                },
                undefined,
                checkCurrentFirmwareVersion,
                requireUserConfirmation,
            ),
        );
    };

export const recoverHex =
    (device: Device): AppThunk =>
    (dispatch, getState) => {
        getState().app.rssi.serialPort?.close(() => {
            dispatch(clearSerialPort());
            dispatch(
                prepareDevice(
                    device,
                    deviceSetupConfig,
                    programmedDevice => {
                        dispatch(openDevice(programmedDevice));
                    },
                    () => {},
                    undefined,
                    false,
                    false,
                ),
            );
        });
    };
