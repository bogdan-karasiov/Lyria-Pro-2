/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { throttle } from '../utils/throttle.js';
import './PromptController.js';
import './PlayPauseButton.js';
import { MidiDispatcher } from '../utils/MidiDispatcher.js';

/** The grid of prompt inputs. */
export class PromptDjMidi extends LitElement {
    static styles = css`
    :host {
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      position: relative;
    }
    #background {
      will-change: background-image;
      position: absolute;
      height: 100%;
      width: 100%;
      z-index: -1;
      background: #111;
    }
    #grid {
      width: 80vmin;
      height: 80vmin;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 2.5vmin;
      margin-top: 8vmin;
    }
    prompt-controller {
      width: 100%;
    }
    play-pause-button {
      position: relative;
      width: 15vmin;
    }
    #buttons {
      position: absolute;
      top: 0;
      left: 0;
      padding: 5px;
      display: flex;
      gap: 5px;
      align-items: center;
    }
    button, .button-like {
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: #0002;
      -webkit-font-smoothing: antialiased;
      border: 1.5px solid #fff;
      border-radius: 4px;
      user-select: none;
      padding: 3px 6px;
    }
    button.active, .button-like.active {
      background-color: #fff;
      color: #000;
    }
    button.recording, .button-like.recording {
      background-color: #ff4122;
      color: #fff;
      border-color: #ff4122;
    }
    select {
      font: inherit;
      padding: 5px;
      background: #fff;
      color: #000;
      border-radius: 4px;
      border: none;
      outline: none;
      cursor: pointer;
    }
    #load-set-input {
      display: none;
    }
  `;

    static properties = {
        prompts: { state: true },
        showMidi: { state: true },
        playbackState: { type: String },
        audioLevel: { state: true },
        midiInputIds: { state: true },
        activeMidiInputId: { state: true },
        isRecording: { state: true },
        filteredPrompts: { state: true },
    };

    constructor(initialPrompts) {
        super();
        this.prompts = initialPrompts;
        this.midiDispatcher = new MidiDispatcher();
        this.showMidi = false;
        this.playbackState = 'stopped';
        this.audioLevel = 0;
        this.midiInputIds = [];
        this.activeMidiInputId = null;
        this.isRecording = false;
        this.filteredPrompts = new Set();
    }

    handlePromptChanged(e) {
        const { promptId, text, weight, cc, color } = e.detail;
        const prompt = this.prompts.get(promptId);
        if (!prompt) {
            console.error('prompt not found', promptId);
            return;
        }
        prompt.text = text;
        prompt.weight = weight;
        prompt.cc = cc;
        prompt.color = color;
        // Re-assign to trigger Lit update
        this.prompts = new Map(this.prompts);
        this.dispatchEvent(new CustomEvent('prompts-changed', { detail: this.prompts }));
    }

    /** Generates radial gradients for each prompt based on weight and color. */
    makeBackground = throttle(() => {
        const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
        const MAX_WEIGHT = 0.5;
        const MAX_ALPHA = 0.6;
        const bg = [];
        [...this.prompts.values()].forEach((p, i) => {
            const alphaPct = clamp01(p.weight / MAX_WEIGHT) * MAX_ALPHA;
            const alpha = Math.round(alphaPct * 0xff)
                .toString(16)
                .padStart(2, '0');
            const stop = p.weight / 2;
            const x = (i % 4) / 3;
            const y = Math.floor(i / 4) / 3;
            const s = `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${p.color}${alpha} 0px, ${p.color}00 ${stop * 100}%)`;
            bg.push(s);
        });
        return bg.join(', ');
    }, 30);

    toggleShowMidi() {
        return this.setShowMidi(!this.showMidi);
    }

    async setShowMidi(show) {
        this.showMidi = show;
        if (!this.showMidi) return;
        try {
            const inputIds = await this.midiDispatcher.getMidiAccess();
            this.midiInputIds = inputIds;
            this.activeMidiInputId = this.midiDispatcher.activeMidiInputId;
        }
        catch (e) {
            this.showMidi = false;
            this.dispatchEvent(new CustomEvent('error', { detail: e.message }));
        }
    }

    handleMidiInputChange(event) {
        const selectElement = event.target;
        const newMidiId = selectElement.value;
        this.activeMidiInputId = newMidiId;
        this.midiDispatcher.activeMidiInputId = newMidiId;
    }

    playPause() {
        this.dispatchEvent(new CustomEvent('play-pause'));
    }

    addFilteredPrompt(prompt) {
        this.filteredPrompts = new Set([...this.filteredPrompts, prompt]);
    }

    handleSaveSet() {
        const promptsArray = Array.from(this.prompts.values());
        const dataStr = JSON.stringify(promptsArray, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'promptdj-set.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    handleLoadSet(event) {
        const input = event.target;
        if (!input.files || input.files.length === 0) {
            return;
        }
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result;
                if (typeof content !== 'string') {
                    throw new Error('Invalid file content.');
                }
                const loadedPrompts = JSON.parse(content);
                if (!Array.isArray(loadedPrompts) || loadedPrompts.some(p => !p.promptId || !p.text)) {
                    throw new Error('Invalid set file format.');
                }
                const newPrompts = new Map();
                loadedPrompts.forEach(p => newPrompts.set(p.promptId, p));
                this.prompts = newPrompts;
                this.dispatchEvent(new CustomEvent('prompts-changed', { detail: this.prompts }));
                this.dispatchEvent(new CustomEvent('info', { detail: 'Set loaded successfully!' }));
            }
            catch (err) {
                this.dispatchEvent(new CustomEvent('error', { detail: `Error loading set: ${err.message}` }));
            }
            finally {
                input.value = '';
            }
        };
        reader.onerror = () => {
            this.dispatchEvent(new CustomEvent('error', { detail: 'Failed to read the file.' }));
        };
        reader.readAsText(file);
    }

    handleRecordClick() {
        if (this.isRecording) {
            this.dispatchEvent(new CustomEvent('stop-recording'));
            this.isRecording = false;
        }
        else {
            if (this.playbackState !== 'playing' && this.playbackState !== 'loading') {
                this.dispatchEvent(new CustomEvent('error', { detail: 'Please start playback before recording.' }));
                return;
            }
            this.dispatchEvent(new CustomEvent('start-recording'));
            this.isRecording = true;
        }
    }

    downloadRecording(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PromptDJ_Recording_${new Date().toISOString()}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.dispatchEvent(new CustomEvent('info', { detail: 'Recording saved!' }));
    }

    render() {
        const bg = styleMap({
            backgroundImage: this.makeBackground(),
        });
        return html`<div id="background" style=${bg}></div>
      <div id="buttons">
        <button @click=${this.handleSaveSet}>Save Set</button>
        <label for="load-set-input" class="button-like">Load Set</label>
        <input id="load-set-input" type="file" @change=${this.handleLoadSet} accept=".json,application/json" />
        <button
          @click=${this.toggleShowMidi}
          class=${this.showMidi ? 'active' : ''}
          >MIDI</button
        >
        <select
          @change=${this.handleMidiInputChange}
          .value=${this.activeMidiInputId || ''}
          style=${this.showMidi ? '' : 'visibility: hidden'}>
          ${this.midiInputIds.length > 0
            ? this.midiInputIds.map((id) => html`<option value=${id}>
                    ${this.midiDispatcher.getDeviceName(id)}
                  </option>`)
            : html`<option value="">No devices found</option>`}
        </select>
         <button @click=${this.handleRecordClick} class=${this.isRecording ? 'recording' : ''}>
          ${this.isRecording ? 'Stop' : 'Record'}
        </button>
      </div>
      <div id="grid">${this.renderPrompts()}</div>
      <play-pause-button .playbackState=${this.playbackState} @click=${this.playPause}></play-pause-button>`;
    }

    renderPrompts() {
        return [...this.prompts.values()].map((prompt) => {
            return html`<prompt-controller
                .promptId=${prompt.promptId}
                ?filtered=${this.filteredPrompts.has(prompt.text)}
                .cc=${prompt.cc}
                .text=${prompt.text}
                .weight=${prompt.weight}
                .color=${prompt.color}
                .midiDispatcher=${this.midiDispatcher}
                .showCC=${this.showMidi}
                @prompt-changed=${this.handlePromptChanged}>
            </prompt-controller>`;
        });
    }
}

customElements.define('prompt-dj-midi', PromptDjMidi);
