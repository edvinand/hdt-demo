/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    Card,
    StateSelector,
} from '@nordicsemiconductor/pc-nrfconnect-shared';

import {
    getDisplayType,
    setDisplayType,
} from '../../features/throughputDevice/throughputDeviceSlice';

const DISPLAY_OPTIONS = ['Bars', 'Gauge'] as const;

const DisplayTypeSelector = () => {
    const dispatch = useDispatch();
    const displayType = useSelector(getDisplayType);

    const selectedItem = displayType === 'gauge' ? 'Gauge' : 'Bars';

    return (
        <Card title="Display">
            <div className="tw-flex tw-items-center tw-justify-between">
                <StateSelector
                    items={[...DISPLAY_OPTIONS]}
                    selectedItem={selectedItem}
                    onSelect={selectedIndex => {
                        dispatch(
                            setDisplayType(
                                selectedIndex === 1 ? 'gauge' : 'bars',
                            ),
                        );
                    }}
                />
            </div>
        </Card>
    );
};

export default DisplayTypeSelector;
