/*
 * Copyright (c) 2024 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card, StateSelector } from '@nordicsemiconductor/pc-nrfconnect-shared';

import {
    getPhyEnabled,
    setPhyEnabled,
} from '../../features/throughputDevice/throughputDeviceSlice';

const PHY_LABELS = ['PHY 1', 'PHY 2', 'PHY 3', 'PHY 4', 'PHY 5'];

const ConfigPhySelector = () => {
    const dispatch = useDispatch();
    const phyEnabled = useSelector(getPhyEnabled);

    return (
        <Card title="PHY configuration">
            <div className="tw-flex tw-flex-col tw-gap-2">
                {PHY_LABELS.map((label, index) => {
                    const enabled = phyEnabled[index];
                    const selectedItem = enabled ? 'On' : 'Off';

                    return (
                        <div
                            key={label}
                            className="tw-flex tw-items-center tw-justify-between"
                        >
                            <span>{label}</span>
                            <StateSelector
                                items={['Off', 'On']}
                                selectedItem={selectedItem}
                                onSelect={selectedIndex => {
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
