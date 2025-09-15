/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/** Simple class for dispatching MIDI CC messages as events. */
export class MidiDispatcher extends EventTarget {
    constructor() {
        super();
        this.access = null;
        this.activeMidiInputId = null;
    }

    async getMidiAccess() {
        if (this.access) {
            return [...this.access.inputs.keys()];
        }
        if (!navigator.requestMIDIAccess) {
            throw new Error('Your browser does not support the Web MIDI API. For a list of compatible browsers, see https://caniuse.com/midi');
        }
        try {
            this.access = await navigator.requestMIDIAccess({ sysex: false });
        } catch(error) {
            throw new Error('Unable to acquire MIDI access.');
        }

        const inputIds = [...this.access.inputs.keys()];
        if (inputIds.length > 0 && this.activeMidiInputId === null) {
            this.activeMidiInputId = inputIds[0];
        }

        for (const input of this.access.inputs.values()) {
            input.onmidimessage = (event) => {
                if (input.id !== this.activeMidiInputId) return;
                
                const { data } = event;
                if (!data) {
                    console.error('MIDI message has no data');
                    return;
                }

                const statusByte = data[0];
                const channel = statusByte & 0x0f;
                const messageType = statusByte & 0xf0;
                const isControlChange = messageType === 0xb0;

                if (!isControlChange) return;

                const detail = { cc: data[1], value: data[2], channel };
                this.dispatchEvent(new CustomEvent('cc-message', { detail }));
            };
        }
        return inputIds;
    }

    getDeviceName(id) {
        if (!this.access) {
            return null;
        }
        const input = this.access.inputs.get(id);
        return input ? input.name : null;
    }
}
