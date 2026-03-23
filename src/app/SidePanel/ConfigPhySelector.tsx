/*
 * Copyright (c) 2024 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    Card,
    selectedDevice,
    StateSelector,
} from '@nordicsemiconductor/pc-nrfconnect-shared';

import {
    getPhyEnabled,
    setPhyEnabled,
} from '../../features/throughputDevice/throughputDeviceSlice';
import { PHY_LABELS } from '../../features/throughputDevice/phyLabels';

const ConfigPhySelector = () => {
    const dispatch = useDispatch();
    const phyEnabled = useSelector(getPhyEnabled);
    const device = useSelector(selectedDevice);

    const boardVersion = device?.devkit?.boardVersion?.toUpperCase() ?? '';
    const isPca10056 = boardVersion === 'PCA10056';

    return (
        <Card title="PHY configuration">
            <div className="tw-flex tw-flex-col tw-gap-2">
                {PHY_LABELS.map((label, index) => {
                    const unsupported = isPca10056 && index < 5;
                    const enabled = phyEnabled[index];
                    const selectedItem =
                        unsupported ? 'Off' : enabled ? 'On' : 'Off';

                    return (
                        <div
                            key={label}
                            className={`tw-flex tw-items-center tw-justify-between${
                                unsupported ? ' tw-opacity-50' : ''
                            }`}
                        >
                            <span className="tw-inline-block tw-w-24 tw-whitespace-nowrap">
                                {label}
                            </span>
                            <StateSelector
                                items={['Off', 'On']}
                                selectedItem={selectedItem}
                                disabled={unsupported}
                                onSelect={selectedIndex => {
                                    if (unsupported) return;
                                    const isEnabled = selectedIndex === 1;
                                    dispatch(
                                        setPhyEnabled({
                                            index,
                                            enabled: isEnabled,
                                        }),
                                    );
                                }}
                            />
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};

export default ConfigPhySelector;
