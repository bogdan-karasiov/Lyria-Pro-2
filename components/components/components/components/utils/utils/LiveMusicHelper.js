/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { decode, decodeAudioData } from './audio.js';
import { throttle } from './throttle.js';

export class LiveMusicHelper extends EventTarget {
    constructor(ai, model) {
        super();
        this.ai = ai;
        this.model = model;
        this.session = null;
        this.sessionPromise = null;
        this.connectionError = true;
        this.filteredPrompts = new Set();
        this.nextStartTime = 0;
        this.bufferTime = 2;
        this.extraDestination = null;
        this.playbackState = 'stopped';
        this.mediaRecorder = null;
        this.recordedChunks = [];
        
        this.prompts = new Map();
        this.audioContext = new AudioContext({ sampleRate: 48000 });
        this.outputNode = this.audioContext.createGain();
        this.mediaStreamDestination = this.audioContext.createMediaStreamDestination();
    }
    
    setWeightedPrompts = throttle(async (prompts) => {
        this.prompts = prompts;
        if (this.activePrompts.length === 0) {
            this.dispatchEvent(new CustomEvent('error', { detail: 'There needs to be one active prompt to play.' }));
            this.pause();
            return;
        }
        if (!this.session) return;
        try {
            await this.session.setWeightedPrompts({
                weightedPrompts: this.activePrompts,
            });
        }
        catch (e) {
            this.dispatchEvent(new CustomEvent('error', { detail: e.message }));
            this.pause();
        }
    }, 200);

    getSession() {
        if (!this.sessionPromise)
            this.sessionPromise = this.connect();
        return this.sessionPromise;
    }

    async connect() {
        this.sessionPromise = this.ai.live.music.connect({
            model: this.model,
            callbacks: {
                onmessage: async (e) => {
                    if (e.setupComplete) {
                        this.connectionError = false;
                    }
                    if (e.filteredPrompt) {
                        this.filteredPrompts = new Set([...this.filteredPrompts, e.filteredPrompt.text]);
                        this.dispatchEvent(new CustomEvent('filtered-prompt', { detail: e.filteredPrompt }));
                    }
                    if (e.serverContent?.audioChunks) {
                        await this.processAudioChunks(e.serverContent.audioChunks);
                    }
                },
                onerror: () => {
                    this.connectionError = true;
                    this.stop();
                    this.dispatchEvent(new CustomEvent('error', { detail: 'Connection error, please restart audio.' }));
                },
                onclose: () => {
                    this.connectionError = true;
                    this.stop();
                    this.dispatchEvent(new CustomEvent('error', { detail: 'Connection error, please restart audio.' }));
                },
            },
        });
        return this.sessionPromise;
    }

    setPlaybackState(state) {
        this.playbackState = state;
        this.dispatchEvent(new CustomEvent('playback-state-changed', { detail: state }));
    }

    async processAudioChunks(audioChunks) {
        if (this.playbackState === 'paused' || this.playbackState === 'stopped') return;
        
        const audioBuffer = await decodeAudioData(decode(audioChunks[0].data), this.audioContext, 48000, 2);
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputNode);

        if (this.nextStartTime === 0) {
            this.nextStartTime = this.audioContext.currentTime + this.bufferTime;
            setTimeout(() => {
                this.setPlaybackState('playing');
            }, this.bufferTime * 1000);
        }

        if (this.nextStartTime < this.audioContext.currentTime) {
            this.setPlaybackState('loading');
            this.nextStartTime = 0;
            return;
        }

        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
    }

    get activePrompts() {
        return Array.from(this.prompts.values())
            .filter((p) => {
                return !this.filteredPrompts.has(p.text) && p.weight !== 0;
            });
    }

    async play() {
        this.setPlaybackState('loading');
        this.session = await this.getSession();
        await this.setWeightedPrompts(this.prompts);
        this.audioContext.resume();
        this.session.play();

        this.outputNode.connect(this.audioContext.destination);
        if (this.extraDestination) this.outputNode.connect(this.extraDestination);
        this.outputNode.connect(this.mediaStreamDestination);
        
        this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
    }

    pause() {
        if (this.session) this.session.pause();
        this.setPlaybackState('paused');
        this.outputNode.gain.setValueAtTime(1, this.audioContext.currentTime);
        this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
        this.nextStartTime = 0;
        this.outputNode = this.audioContext.createGain();
    }

    stop() {
        if (this.session) this.session.stop();
        this.setPlaybackState('stopped');
        if (this.outputNode.gain) {
            this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
            this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
        }
        this.nextStartTime = 0;
        this.session = null;
        this.sessionPromise = null;
    }

    async playPause() {
        switch (this.playbackState) {
            case 'playing':
                return this.pause();
            case 'paused':
            case 'stopped':
                return this.play();
            case 'loading':
                return this.stop();
        }
    }

    startRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            console.warn('Recording is already in progress.');
            return;
        }
        const options = { mimeType: 'audio/webm' };
        try {
            this.mediaRecorder = new MediaRecorder(this.mediaStreamDestination.stream, options);
        }
        catch (e) {
            console.error('Recording format not supported, trying default.');
            try {
                this.mediaRecorder = new MediaRecorder(this.mediaStreamDestination.stream);
            }
            catch (err) {
                this.dispatchEvent(new CustomEvent('error', { detail: 'Recording is not supported in this browser.' }));
                return;
            }
        }
        this.recordedChunks = [];
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };
        this.mediaRecorder.start();
    }

    stopRecording() {
        return new Promise(resolve => {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                console.warn('Recording is not active.');
                resolve(null);
                return;
            }
            this.mediaRecorder.onstop = () => {
                const mimeType = this.recordedChunks[0]?.type || 'audio/mp3';
                const audioBlob = new Blob(this.recordedChunks, { type: mimeType });
                this.recordedChunks = [];
                resolve(audioBlob);
            };
            this.mediaRecorder.stop();
        });
    }
}
