/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

/** A single prompt input associated with a MIDI CC. */
export class PromptController extends LitElement {
    static styles = css`
    .prompt {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      position: relative;
    }

    .slider-container {
      width: 40%;
      height: 70%;
      background-color: #0003;
      border-radius: 1vmin;
      cursor: ns-resize;
      position: relative;
      overflow: hidden;
      border: 0.15vmin solid #fff4;
      touch-action: none;
    }

    .slider-track {
      position: absolute;
      bottom: 0;
      width: 100%;
      background-color: var(--prompt-color, #888);
      border-radius: 1vmin;
    }
    
    .slider-thumb {
      position: absolute;
      width: 120%;
      left: -10%;
      height: 0.8vmin;
      background-color: #fff;
      border-radius: 0.2vmin;
      box-shadow: 0 0 1vmin #0008;
      pointer-events: none; /* important for dragging */
    }

    #midi {
      font-family: monospace;
      text-align: center;
      font-size: 1.5vmin;
      border: 0.2vmin solid #fff;
      border-radius: 0.5vmin;
      padding: 2px 5px;
      color: #fff;
      background: #0006;
      cursor: pointer;
      visibility: hidden;
      user-select: none;
      margin-top: 0.75vmin;
    }
    
    .learn-mode #midi {
      color: orange;
      border-color: orange;
    }
    
    .show-cc #midi {
      visibility: visible;
    }

    #text {
      font-weight: 500;
      font-size: 1.8vmin;
      max-width: 17vmin;
      min-width: 2vmin;
      padding: 0.1em 0.3em;
      margin-top: 1vmin;
      flex-shrink: 0;
      border-radius: 0.25vmin;
      text-align: center;
      white-space: pre;
      overflow: hidden;
      border: none;
      outline: none;
      -webkit-font-smoothing: antialiased;
      background: #000;
      color: #fff;
    }
    
    #text:not(:focus) {
      text-overflow: ellipsis;
    }

    :host([filtered]) .slider-track {
      background-color: #888;
      opacity: 0.5;
    }
    
    :host([filtered]) #text {
      background: #da2000;
      z-index: 1;
    }

    @media only screen and (max-width: 600px) {
      #text {
        font-size: 2.3vmin;
      }
    }
  `;

    static properties = {
        promptId: { type: String },
        text: { type: String },
        weight: { type: Number },
        color: { type: String },
        filtered: { type: Boolean, reflect: true },
        cc: { type: Number },
        channel: { type: Number },
        learnMode: { type: Boolean },
        showCC: { type: Boolean },
        midiDispatcher: { type: Object },
    };

    constructor() {
        super();
        this.promptId = '';
        this.text = '';
        this.weight = 0;
        this.color = '';
        this.filtered = false;
        this.cc = 0;
        this.channel = 0; // Not currently used
        this.learnMode = false;
        this.showCC = false;
        this.midiDispatcher = null;
        this.lastValidText = '';
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        this.midiDispatcher?.addEventListener('cc-message', (e) => {
            const { channel, cc, value } = e.detail;
            if (this.learnMode) {
                this.cc = cc;
                this.channel = channel;
                this.learnMode = false;
                this.dispatchPromptChange();
            }
            else if (cc === this.cc) {
                this.weight = (value / 127) * 2;
                this.dispatchPromptChange();
            }
        });
    }

    firstUpdated(changedProperties) {
        super.firstUpdated(changedProperties);
        this.sliderContainer = this.renderRoot.querySelector('.slider-container');
        this.textInput = this.renderRoot.querySelector('#text');
        this.textInput.setAttribute('contenteditable', 'plaintext-only');
        this.textInput.textContent = this.text;
        this.lastValidText = this.text;
    }

    update(changedProperties) {
        if (changedProperties.has('showCC') && !this.showCC) {
            this.learnMode = false;
        }
        if (changedProperties.has('text') && this.textInput) {
            this.textInput.textContent = this.text;
        }
        super.update(changedProperties);
    }

    dispatchPromptChange() {
        this.dispatchEvent(new CustomEvent('prompt-changed', {
            bubbles: true,
            composed: true,
            detail: {
                promptId: this.promptId,
                text: this.text,
                weight: this.weight,
                cc: this.cc,
                color: this.color,
            },
        }));
    }

    onKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.textInput.blur();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            this.resetText();
            this.textInput.blur();
        }
    }

    resetText() {
        this.text = this.lastValidText;
        this.textInput.textContent = this.lastValidText;
    }

    async updateText() {
        const newText = this.textInput.textContent?.trim();
        if (!newText) {
            this.resetText();
        }
        else {
            this.text = newText;
            this.lastValidText = newText;
        }
        this.dispatchPromptChange();
        this.textInput.scrollLeft = 0;
    }

    onFocus() {
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(this.textInput);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    handlePointerDown(e) {
        e.preventDefault();
        document.body.classList.add('dragging');
        this.updateWeightFromEvent(e);
        window.addEventListener('pointermove', this.handlePointerMove);
        window.addEventListener('pointerup', this.handlePointerUp);
    }

    handlePointerMove(e) {
        this.updateWeightFromEvent(e);
    }

    handlePointerUp() {
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerup', this.handlePointerUp);
        document.body.classList.remove('dragging');
    }

    updateWeightFromEvent(e) {
        const rect = this.sliderContainer.getBoundingClientRect();
        const rawY = (e.clientY - rect.top) / rect.height;
        const normalizedY = 1 - rawY;
        this.weight = Math.max(0, Math.min(2, normalizedY * 2));
        this.dispatchPromptChange();
    }

    toggleLearnMode() {
        this.learnMode = !this.learnMode;
    }

    render() {
        const classes = classMap({
            'prompt': true,
            'learn-mode': this.learnMode,
            'show-cc': this.showCC,
        });
        const weightPercent = (this.weight / 2) * 100;
        const sliderTrackStyle = styleMap({
            'height': `${weightPercent}%`,
            '--prompt-color': this.color,
        });
        const sliderThumbStyle = styleMap({
            'bottom': `${weightPercent}%`
        });
        return html`
      <div class=${classes}>
        <div class="slider-container" @pointerdown=${this.handlePointerDown}>
          <div class="slider-track" style=${sliderTrackStyle}></div>
          <div class="slider-thumb" style=${sliderThumbStyle}></div>
        </div>
        <span
          id="text"
          spellcheck="false"
          @focus=${this.onFocus}
          @keydown=${this.onKeyDown}
          @blur=${this.updateText}></span>
        <div id="midi" @click=${this.toggleLearnMode}>
          ${this.learnMode ? 'Learn' : `CC:${this.cc}`}
        </div>
      </div>
    `;
    }
}

customElements.define('prompt-controller', PromptController);
