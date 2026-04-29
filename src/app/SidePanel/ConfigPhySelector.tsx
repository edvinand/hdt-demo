/*
 * Copyright (c) 2024 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
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
        <div className="tw-flex tw-flex-col tw-gap-2 tw-px-1">
            <span className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wide tw-text-gray-600">
                PHY configuration
            </span>
            {PHY_LABELS.map((label, index) => {
                const unsupported = isPca10056 && index < 5;
                const enabled = phyEnabled[index];
                const selectedItem = unsupported ? 'Off' : enabled ? 'On' : 'Off';

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
                        <div className="tw-w-24">
                            <StateSelector
                                items={['Off', 'On']}
                                selectedItem={selectedItem}
                                size="sm"
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
                    </div>
                );
            })}
        </div>
    );
};

export default ConfigPhySelector;
