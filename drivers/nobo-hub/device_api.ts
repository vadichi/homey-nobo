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
const GET_STATE_RESPONSE_CURRENT_STATE_MESSAGE: string = 'H04';
const GET_STATE_RESPONSE_FINAL_MESSAGE: string = 'H05';

const KEEPALIVE_INTERVAL_SECONDS: number = 14;
const MODE_CHANGE_LISTENER_INTERVAL_SECONDS: number = 3;

const NOBO_HUB_USEFUL_RESPONSES: string[] = [
    CONNECT_COMMAND,
    CONNECT_REJECT_RESPONSE,
    HANDSHAKE_MESSAGE,
    ADD_OVERRIDE_EVENT,
    GET_STATE_RESPONSE_CURRENT_STATE_MESSAGE,
    GET_STATE_RESPONSE_FINAL_MESSAGE
];

export class NoboHubAPI {
    private socket: net.Socket;
    private messageQueue: AsyncQueue<string> = new AsyncQueue<string>();
    private currentMode: NoboHubMode = NoboHubMode.NORMAL;

    private owner: NoboHub | NoboHubDriver;

    constructor(owner: NoboHub | NoboHubDriver) {
        this.owner = owner

        this.socket = new net.Socket();
        this.socket.setEncoding('utf8');
        this.socket.setKeepAlive(true);
        this.proprietaryKeepAliveSender().then();
    }

    async attemptConnection(ip: string, serial: string): Promise<boolean> {
        let temporary_connect_listener = async () => {};
        let temporary_error_listener = async() => {};

        await this.messageQueue.clear();
        this.socket.addListener('data', this.onMessage);

        let result = await new Promise<boolean>((resolve) => {
            this.socket.connect({host: ip, port: PORT});

            temporary_connect_listener = async () => {
                let timestamp = this.getCurrentTimestamp();
                let connect_command = `${CONNECT_COMMAND} ${COMMAND_SET_VERSION} ${serial} ${timestamp}\r`;

                this.socket.write(connect_command);

                let response = await this.messageQueue.dequeue();
                if (response.startsWith(CONNECT_REJECT_RESPONSE)) {
                    resolve(false);
                    return;
                }

                let handshake_command = `${HANDSHAKE_MESSAGE}\r`;
                this.socket.write(handshake_command);
                await this.messageQueue.dequeue();

                resolve(true);
                return;
            };

            temporary_error_listener = async () => {
                resolve(false);
                return;
            };

            this.socket.addListener('connect', temporary_connect_listener);
            this.socket.addListener('error', temporary_error_listener);
        });

        this.socket.removeListener('connect', temporary_connect_listener);
        this.socket.removeListener('error', temporary_error_listener);

        await this.requestCurrentMode();
        this.modeChangeListener().then();

        return result
    }

    async closeConnection() {
        if (!this.socket.closed) {
            this.socket.end();
        }
    }

    updateOwner(newOwner: NoboHub | NoboHubDriver) {
        this.owner = newOwner;
    }

    private async onMessage(message: string) {
        message = message.trim();

        this.owner.log('Incoming message:' + message);

        let message_tokens = message.split(' ');

        if (message_tokens[0] in NOBO_HUB_USEFUL_RESPONSES) {
            await this.messageQueue.enqueue(message);
            this.owner.log('Message enqueued:' + message);
        }
    }

    private async modeChangeListener() {
        while (true) {
            if (this.socket.closed) {
                return;
            }

            let message = await this.messageQueue.peek();
            let messageTokens = message.split(' ');

            if (messageTokens[0] == ADD_OVERRIDE_EVENT) {
                await this.messageQueue.dequeue();

                if (messageTokens[6] == GLOBAL_STATE_MARKER_TOKEN_6 &&
                    messageTokens[7] == GLOBAL_STATE_MARKER_TOKEN_7) {
                    this.setMode(messageTokens[2]);
                }
            }

            await new Promise<void>(resolve => setTimeout(resolve, MODE_CHANGE_LISTENER_INTERVAL_SECONDS * 1000));
        }
    }

    private async requestCurrentMode(){
        let command = `${GET_STATE_COMMAND}\r`;
        this.socket.write(command);

        let response: string;
        let responseTokens: string[];
        do {
            response = await this.messageQueue.dequeue();
            responseTokens = response.split(' ');

            if (responseTokens[0] != GET_STATE_RESPONSE_CURRENT_STATE_MESSAGE) continue;

            if (responseTokens[6] == GLOBAL_STATE_MARKER_TOKEN_6 &&
                responseTokens[7] == GLOBAL_STATE_MARKER_TOKEN_7) {
                this.setMode(responseTokens[2]);
            }
        } while (responseTokens[0] != GET_STATE_RESPONSE_FINAL_MESSAGE);
    }

    private async switchMode(newMode: NoboHubMode){
        let command = `${SET_STATE_COMMAND} 1 0 ${newMode.valueOf()} -1 -1 ${GLOBAL_STATE_MARKER_TOKEN_6} ${GLOBAL_STATE_MARKER_TOKEN_7}\r`;
        this.socket.write(command);
    }

    private async proprietaryKeepAliveSender() {
        while (true) {
            if (this.socket.closed) {
                return
            }

            let command = `${KEEPALIVE_COMMAND}\r`;
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
    }
}

enum NoboHubMode {
    NORMAL = 0,
    COMFORT = 1,
    ECO = 2,
    AWAY = 3,
}
