/*
 * Copyright 2024 Vadim Chichikalyuk
 *
 * This file is part of Homey-Nobo
 *
 * Homey-Nobo is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Homey-Nobo is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Homey-Nobo. If not, see <https://www.gnu.org/licenses/>.
 */

import Homey from 'homey';
import {NoboHubAPI, NoboHubMode} from "./device_api";
import NoboHubDriver from "./driver";

const RECONNECTION_DELAY_SECONDS: number = 1;
const RECONNECTION_MAXIMUM_ATTEMPTS: number = 15;

export class NoboHub extends Homey.Device {
    private apiConnection: NoboHubAPI | undefined = undefined;

    private modeAction = this.homey.flow.getActionCard('nobo_status_capability_set');
    private modeIsCondition = this.homey.flow.getConditionCard('nobo_status_capability_is');
    private modeChangedToNormalTrigger = this.homey.flow.getDeviceTriggerCard('nobo_status_capability_changed_to_normal');
    private modeChangedToEcoTrigger = this.homey.flow.getDeviceTriggerCard('nobo_status_capability_changed_to_eco');
    private modeChangedToComfortTrigger = this.homey.flow.getDeviceTriggerCard('nobo_status_capability_changed_to_comfort');
    private modeChangedToAwayTrigger = this.homey.flow.getDeviceTriggerCard('nobo_status_capability_changed_to_away');

    async onInit() {
        this.log('Initialising');

        if (NoboHubDriver.addedDeviceSerial != undefined) {
            this.log('Initialising as a new device');

            this.log(`Changing temporary serial to ${NoboHubDriver.addedDeviceSerial!}`);
            await this.setSettings({serial: parseInt(NoboHubDriver.addedDeviceSerial!)});

            this.apiConnection = NoboHubDriver.addedDeviceAPIConnection!;
            this.apiConnection!.updateOwner(this);
        }

        if (this.apiConnection == undefined) {
            let ip = this.getStoreValue('ip');
            let serial = String(this.getSetting('serial'));

            this.log(`Attempting connection to an existing device at ${ip}`);

            // Handle result; launch repair if necessary
            this.apiConnection = new NoboHubAPI(this);
            await this.apiConnection!.attemptConnection(ip, serial);
        }

        this.registerCapabilityListener('nobo_status_capability', async (option: string) => {
            let newMode = NoboHubMode[option as keyof typeof NoboHubMode];
            await this.apiConnection!.switchMode(newMode);
        });

        this.apiConnection!.on('mode_change', (mode: NoboHubMode) => {
           this.setCapabilityValue('nobo_status_capability', NoboHubMode[mode]);

           switch (mode) {
               case NoboHubMode.NORMAL:
                   this.modeChangedToNormalTrigger.trigger(this);
                   break;
               case NoboHubMode.ECO:
                     this.modeChangedToEcoTrigger.trigger(this);
                     break;
                case NoboHubMode.COMFORT:
                    this.modeChangedToComfortTrigger.trigger(this);
                    break;
                case NoboHubMode.AWAY:
                    this.modeChangedToAwayTrigger.trigger(this);
                    break;
           }
        });

        this.apiConnection!.on('network_error', async () => {
            this.log('Network error, attempting reconnection');

            for (let i = 0; i < RECONNECTION_MAXIMUM_ATTEMPTS; i++) {
                this.log(`Waiting ${RECONNECTION_DELAY_SECONDS} seconds`);
                await new Promise(resolve => setTimeout(resolve, RECONNECTION_DELAY_SECONDS * 1000));

                let result = await this.apiConnection!.attemptReconnection();
                if (result) {
                    this.log('Reconnection successful');
                    return;
                }
            }

            throw Error('Reconnection failed');
        });

        this.modeAction.registerRunListener(async (args, _) => {
            await this.apiConnection!.switchMode(args["mode"] as NoboHubMode);
        });
        this.modeIsCondition.registerRunListener(async (args, _) => {
            return args["mode"] == this.getCapabilityValue('nobo_status_capability');
        });
        this.log('Initialised flow card listeners')

        await this.setCapabilityValue('nobo_status_capability', NoboHubMode[this.apiConnection!.currentMode]);
        this.log('Initialised');
    }


    async onDeleted() {
        this.log('Removing')

        await this.apiConnection!.closeConnection();

        this.log('Removed');
    }

    async onUninit() {
        this.log('Uninitialising');

        await this.apiConnection!.closeConnection();

        this.log('Uninitialised');
    }

}

module.exports = NoboHub;
export default NoboHub;
