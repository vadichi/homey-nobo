/*
 * Copyright 2023 Vadim Chichikalyuk
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
import net from 'net';
import {AsyncQueue} from "./definitions";

const NOBO_HUB_API_PORT: number = 27779;

export class NoboHub extends Homey.Device {

    private static addedDeviceSerial: string | undefined = undefined;
    private static addedDeviceSocket: net.Socket | undefined = undefined;
    private static addedDeviceMessageQueue: AsyncQueue<string> | undefined = undefined;

    private socket: net.Socket | undefined = undefined;
    private message_queue: AsyncQueue<string> | undefined = undefined;

    static async attemptConnection(ip: string, serial: string): Promise<[boolean, string]> {
        return await new Promise((resolve) => {
            let socket: net.Socket = new net.Socket();
            socket.setEncoding('utf8');

            socket.connect({ host: ip, port: NOBO_HUB_API_PORT });
            socket.on('connect', async () => {
                socket.write(`HELLO 1.1 ${serial} ${NoboHub.getDateTime()}\r`);
                let response = await message_queue.dequeue();

                if (response.startsWith('REJECT')) {
                    let reject_code = response.charAt('REJECT'.length + 1);
                    let reject_reason: string = 'UNKNOWN_ERROR';
                    if (reject_code == '0') {
                        reject_reason = 'INVALID_COMMAND_SET_VERSION';
                    } else if (reject_code == '1') {
                        reject_reason = 'INVALID_SERIAL';
                    } else if (reject_code == '2') {
                        reject_reason = 'INVALID_ARGUMENTS';
                    } else if (reject_code == '3') {
                        reject_reason = 'INVALID_TIMESTAMP';
                    }

                    socket.end();

                    resolve([false, reject_reason]);
                    return;
                }

                socket.write('HANDSHAKE\r');
                await message_queue.dequeue();

                NoboHub.addedDeviceSerial = serial;
                NoboHub.addedDeviceSocket = socket;
                NoboHub.addedDeviceMessageQueue = message_queue;

                resolve([true, 'SUCCESS']);
                return;
            });

            let message_queue = new AsyncQueue<string>();
            socket.on('data', async (message: string) => {
                await message_queue.enqueue(message);
            });

            socket.on('error', async () => {
                socket.end();

                resolve([false, 'NETWORK_ERROR']);
                return;
            });
        });
    }

    static resetAddedDevice() {
        NoboHub.addedDeviceSerial = undefined;
        NoboHub.addedDeviceSocket = undefined;
        NoboHub.addedDeviceMessageQueue = undefined;
    }

    async onAdded() {
        this.log('Adding a new device');

        this.log(`Changing temporary serial to ${NoboHub.addedDeviceSerial}`);
        await this.setSettings({serial: parseInt(NoboHub.addedDeviceSerial!)});

        this.socket = NoboHub.addedDeviceSocket!;
        this.message_queue = NoboHub.addedDeviceMessageQueue!;
        NoboHub.resetAddedDevice();

        this.log('New device added');
    }

    async onInit() {
        this.log('Initialised');

        if (NoboHub.addedDeviceSocket == undefined) {
            // Handle result
            await NoboHub.attemptConnection(this.getStoreValue('ip'), String(this.getSetting('serial')));
        }

        this.socket = NoboHub.addedDeviceSocket!;
        this.message_queue = NoboHub.addedDeviceMessageQueue!;
        NoboHub.resetAddedDevice();
    }


    async onDeleted() {
        this.socket!.end();

        this.log('Removed');
    }

    async onUninit() {
        this.socket!.end();

        this.log('Uninitialised');
    }

    private static getDateTime(): string {
        const now = new Date();

        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }

}

module.exports = NoboHub;
export default NoboHub;
