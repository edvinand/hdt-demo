/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import React from 'react';
import { useDispatch } from 'react-redux';
import {
    Button,
    Group,
    SidePanel,
} from '@nordicsemiconductor/pc-nrfconnect-shared';

import { showStartupDialog } from '../../features/throughputDevice/throughputDeviceSlice';
import useThroughputDevice from '../../features/throughputDevice/useThroughputDevice';
import Advanced from './Advanced';
import ConfigPhySelector from './ConfigPhySelector';
import ControlButtons, { WriteConfigButton } from './ControlButtons';
import Delay from './Delay';
import DisplayTypeSelector from './DisplayTypeSelector';
import ToggleLed from './ToggleLed';

export default () => {
    useThroughputDevice();
    const dispatch = useDispatch();

    return (
        <SidePanel className="hdt-side-panel-root">
            <div className="hdt-side-panel-layout tw-flex tw-flex-col">
                <div>
                    <div className="tw-mt-4">
                        <Group heading="DISPLAY TYPE">
                            <DisplayTypeSelector />
                        </Group>
                    </div>

                    <div className="tw-mt-4">
                        <Group heading="SELECTED PHYS">
                            <ConfigPhySelector />
                            <Delay />
                        </Group>
                    </div>

                    <div className="tw-mt-4">
                        <Group heading="Device">
                            <ToggleLed />
                        </Group>
                    </div>

                    <div className="tw-mt-4">
                        <Group heading="Advanced" collapsible defaultCollapsed>
                            <Advanced />
                        </Group>
                    </div>

                    <div className="tw-mt-4">
                        <Group heading="Controls">
                            <WriteConfigButton />
                            <ControlButtons />
                        </Group>
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
