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

import NoboHub from "./device";
import NoboHubDriver from "./driver";
import {AsyncQueue} from "./definitions";
import net from "net";
import EventEmitter from "events";

const PORT: number = 27779;
const COMMAND_SET_VERSION: string = "1.1";

const CONNECT_COMMAND: string = 'HELLO';
const CONNECT_REJECT_RESPONSE: string = 'REJECT';
const HANDSHAKE_MESSAGE: string = 'HANDSHAKE';
const KEEPALIVE_COMMAND: string = 'KEEPALIVE';

const ADD_OVERRIDE_EVENT: string = 'B03'
const GLOBAL_STATE_MARKER_TOKEN_6: string = '0';
const GLOBAL_STATE_MARKER_TOKEN_7: string = '-1';

const SET_STATE_COMMAND: string = 'A03';
const GET_STATE_COMMAND: string = 'G00';
const GET_STATE_RESPONSE_CURRENT_MODE_MESSAGE: string = 'H04';
const GET_STATE_RESPONSE_FINAL_MESSAGE: string = 'H05';

const KEEPALIVE_INTERVAL_SECONDS: number = 12;
const MODE_CHANGE_LISTENER_INTERVAL_SECONDS: number = 3;

const NOBO_HUB_USEFUL_RESPONSES: string[] = [
    CONNECT_COMMAND,
    CONNECT_REJECT_RESPONSE,
    HANDSHAKE_MESSAGE,
    ADD_OVERRIDE_EVENT,
    GET_STATE_RESPONSE_CURRENT_MODE_MESSAGE,
    GET_STATE_RESPONSE_FINAL_MESSAGE
];

export class NoboHubAPI extends EventEmitter {
    currentMode: NoboHubMode = NoboHubMode.NORMAL;

    private owner: NoboHub | NoboHubDriver;
    private socket: net.Socket;
    private messageQueue: AsyncQueue<string> = new AsyncQueue<string>();

    constructor(owner: NoboHub | NoboHubDriver) {
        super();

        this.owner = owner

        this.socket = new net.Socket();
        this.socket.setEncoding('utf8');
        this.socket.setKeepAlive(true);

        this.log('Created a new API connection instance');
    }

    async attemptConnection(ip: string, serial: string): Promise<boolean> {
        let temporary_connect_listener = async () => {};
        let temporary_error_listener = async(error: any) => {};

        await this.messageQueue.clear();
        this.socket.addListener('data', async (data: string) => {
            await this.onMessage(data);
        });

        this.log('Initialised message queue');
        this.log('Added socket message listener');

        let result = await new Promise<boolean>((resolve) => {
            this.socket.connect({host: ip, port: PORT});
            this.log('Attempting socket connection');

            temporary_connect_listener = async () => {
                this.log('Successfully established connection')

                let timestamp = this.getCurrentTimestamp();
                let connect_command = `${CONNECT_COMMAND} ${COMMAND_SET_VERSION} ${serial} ${timestamp}\r`;

                this.log('Starting handshake sequence');
                this.log(`Sending HELLO command: ${connect_command}`);
                this.socket.write(connect_command);

                let response = await this.messageQueue.dequeue();
                this.log(`Received response: ${response}`);

                if (response.startsWith(CONNECT_REJECT_RESPONSE)) {
                    this.log('Connection rejected');
                    resolve(false);
                    return;
                } else {
                    this.log('Connection accepted');
                }

                let handshake_command = `${HANDSHAKE_MESSAGE}\r`;

                this.log(`Sending HANDSHAKE command: ${handshake_command}`);
                this.socket.write(handshake_command);

                response = await this.messageQueue.dequeue();
                this.log(`Received response: ${response}`);

                this.log(`Connection successful`);
                resolve(true);
                return;
            };

            temporary_error_listener = async (error: any) => {
                this.log(`Error while connecting to socket: ${error}`);

                resolve(false);
                return;
            };

            this.socket.addListener('connect', temporary_connect_listener);
            this.socket.addListener('error', temporary_error_listener);
            this.log('Added temporary connection event listeners');
        });

        this.socket.removeListener('connect', temporary_connect_listener);
        this.socket.removeListener('error', temporary_error_listener);
        this.log('Removed temporary event listeners');

        if (!result) {
            this.log('Connection attempt failed');
            return result;
        }

        this.log('Requesting current mode');
        await this.requestCurrentMode();

        this.log('Starting mode change listener task');
        this.modeChangeListener().then();

        this.log('Starting custom keep-alive sender task');
        this.proprietaryKeepAliveSender().then();

        this.log(`Pairing complete`)
        return result;
    }

    async closeConnection() {
        this.log('Closing socket');

        if (!this.socket.closed) {
            this.socket.end();
            this.log('Socket close sent');
        } else {
            this.log('Socket is already closed')
        }
    }

    updateOwner(newOwner: NoboHub | NoboHubDriver) {
        this.log(`Updating API owner`);
        this.owner = newOwner;
    }

    private async onMessage(data: string) {
        this.log('Received new transmission');

        data = data.trim();
        let messages = data.split('\r');

        for (let message of messages) {
            this.log(`Message: ${message}`);

            let message_tokens = message.split(' ');
            if (NOBO_HUB_USEFUL_RESPONSES.includes(message_tokens[0])) {
                await this.messageQueue.enqueue(message);
                this.log(`Useful message - enqueued`);
            }
        }
    }

    private async modeChangeListener() {
        this.log('Mode change listener started');

        while (true) {
            if (this.socket.closed) {
                return;
            }

            let message = await this.messageQueue.peek();
            let messageTokens = message.split(' ');

            if (messageTokens[0] == ADD_OVERRIDE_EVENT) {
                this.log('Received add override event');
                this.log('Removing message from queue');
                await this.messageQueue.dequeue();

                if (messageTokens[6] == GLOBAL_STATE_MARKER_TOKEN_6) {
                    this.setMode(messageTokens[2]);

                    this.log('Global mode change');
                    this.log(`New mode: ${this.currentMode}`);
                } else {
                    this.log('Local mode change - ignoring');
                }
            }

            await new Promise<void>(resolve => setTimeout(resolve, MODE_CHANGE_LISTENER_INTERVAL_SECONDS * 1000));
        }
    }

    private async requestCurrentMode(){
        this.log('Requesting current override state');

        let command = `${GET_STATE_COMMAND}\r`;

        this.log(`Sending get state command: ${command}`);
        this.socket.write(command);

        let response: string;
        let responseTokens: string[];
        do {
            response = await this.messageQueue.dequeue();
            responseTokens = response.split(' ');

            if (responseTokens[0] != GET_STATE_RESPONSE_CURRENT_MODE_MESSAGE) continue;
            this.log(`Received response; current mode segment: ${response}`);

            if (responseTokens[6] == GLOBAL_STATE_MARKER_TOKEN_6) {
                this.setMode(responseTokens[2]);

                this.log('Global mode information');
                this.log(`Set mode: ${this.currentMode}`);
            } else {
                this.log(`Local mode information; ignoring`);
            }
        } while (responseTokens[0] != GET_STATE_RESPONSE_FINAL_MESSAGE);

        this.log('Received final response segment');
    }

    async switchMode(newMode: NoboHubMode){
        this.log(`Switching mode to ${newMode}`);

        let command = `${SET_STATE_COMMAND} 1 ${newMode} 3 -1 -1 ${GLOBAL_STATE_MARKER_TOKEN_6} ${GLOBAL_STATE_MARKER_TOKEN_7}\r`;

        this.log(`Sending switch mode command: ${command}`);
        this.socket.write(command);
    }

    private async proprietaryKeepAliveSender() {
        while (true) {
            if (this.socket.closed) {
                return
            }

            let command = `${KEEPALIVE_COMMAND}\r`;

            this.log(`Sending keep-alive message: ${command}`);
            this.socket.write(command);

            await new Promise<void>(resolve => setTimeout(resolve, KEEPALIVE_INTERVAL_SECONDS * 1000));
        }
    }

    private getCurrentTimestamp(): string {
        const now = new Date();

        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }

    private setMode(id: string) {
        this.currentMode = (parseInt(id) as NoboHubMode);

        this.log('Emitting mode change event');
        this.emit('mode_change', this.currentMode);
    }

    private log(message: string) {
        this.owner.log(`[API] ${message.trim()}`);
    }
}

export enum NoboHubMode {
    NORMAL = 0,
    COMFORT = 1,
    ECO = 2,
    AWAY = 3,
}
