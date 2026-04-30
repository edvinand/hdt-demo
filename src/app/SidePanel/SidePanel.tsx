/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import {
    Button,
    Group,
    SidePanel,
} from '@nordicsemiconductor/pc-nrfconnect-shared';
import { useDispatch } from 'react-redux';

import {
    showStartupDialog,
} from '../../features/throughputDevice/throughputDeviceSlice';
import useThroughputDevice from '../../features/throughputDevice/useThroughputDevice';
import ControlButtons, { WriteConfigButton } from './ControlButtons';
import Delay from './Delay';
import DisplayTypeSelector from './DisplayTypeSelector';
import ToggleLed from './ToggleLed';
import ConfigPhySelector from './ConfigPhySelector';
import Advanced from './Advanced';

export default () => {
    useThroughputDevice();
    const dispatch = useDispatch();

    return (
        <SidePanel className="hdt-side-panel-root">
            <div className="hdt-side-panel-layout tw-flex tw-flex-col">
                <div>
                    <Group heading="Controls">
                        <ControlButtons />
                    </Group>

                    <Group heading="DISPLAY TYPE">
                        <DisplayTypeSelector />
                    </Group>

                    <Group heading="SELECTED PHYS">
                        <ConfigPhySelector />
                        <Delay />
                    </Group>

                    <Group heading="Device">
                        <ToggleLed />
                    </Group>

                    <Group heading="Advanced" collapsible defaultCollapsed>
                        <Advanced />
                    </Group>

                    <div className="tw-pt-1">
                        <WriteConfigButton />
                    </div>
                </div>

                <div className="hdt-side-panel-help tw-mt-auto tw-pt-3">
                    <Button
                        variant="secondary"
                        className="w-100"
                        onClick={() => {
                            localStorage.removeItem(
                                'hdt-demo.startup-dialog-dismissed',
                            );
                            dispatch(showStartupDialog());
                        }}
                    >
                        Help
                    </Button>
                </div>
            </div>
        </SidePanel>
    );
};
