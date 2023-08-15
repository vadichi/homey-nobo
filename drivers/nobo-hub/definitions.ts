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

export type DiscoveredDevice = {
    ip: string,
    serial_start: string
}

export class AsyncQueue<T> {
    private items: T[] = Array<T>(0);

    async enqueue(item: T) {
        this.items.unshift(item);
    }

    async dequeue(): Promise<T> {
        while (this.items.length == 0) {
            await new Promise<void>(resolve => setTimeout(resolve, 0));
        }

        return this.items.pop()!;
    }

    async peek(): Promise<T | undefined> {
        if (this.items.length == 0) {
            return undefined;
        }

        return this.items[this.items.length - 1];
    }

    async clear() {
        this.items = Array<T>(0);
    }
}

