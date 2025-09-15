/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from '@google/genai';
import { PromptDjMidi } from './components/PromptDjMidi.js';
import { ToastMessage } from './components/ToastMessage.js';
import { LiveMusicHelper } from './utils/LiveMusicHelper.js';
import { AudioAnalyser } from './utils/AudioAnalyser.js';

const model = 'lyria-realtime-exp';

async function main() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        document.body.innerHTML = `
<div style="font-family: 'Google Sans', sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; background: #212121; color: #fff; text-align: center; padding: 1em;">
  <h1 style="font-weight: 500;">API Key Not Found</h1>
  <p style="color: #ccc;">Please set the API_KEY environment variable to use this application.</p>
</div>`;
        console.error("API_KEY environment variable not set.");
        return;
    }

    const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' });
    const initialPrompts = buildInitialPrompts();
    const pdjMidi = new PromptDjMidi(initialPrompts);
    document.body.appendChild(pdjMidi);

    const toastMessage = new ToastMessage();
    document.body.appendChild(toastMessage);

    const liveMusicHelper = new LiveMusicHelper(ai, model);
    liveMusicHelper.setWeightedPrompts(initialPrompts);

    const audioAnalyser = new AudioAnalyser(liveMusicHelper.audioContext);
    liveMusicHelper.extraDestination = audioAnalyser.node;

    pdjMidi.addEventListener('prompts-changed', (e) => {
        const prompts = e.detail;
        liveMusicHelper.setWeightedPrompts(prompts);
    });

    pdjMidi.addEventListener('play-pause', () => {
        liveMusicHelper.playPause();
    });

    pdjMidi.addEventListener('start-recording', () => {
        liveMusicHelper.startRecording();
    });

    pdjMidi.addEventListener('stop-recording', async () => {
        const audioBlob = await liveMusicHelper.stopRecording();
        if (audioBlob) {
            pdjMidi.downloadRecording(audioBlob);
        }
    });

    liveMusicHelper.addEventListener('playback-state-changed', (e) => {
        const playbackState = e.detail;
        pdjMidi.playbackState = playbackState;
        playbackState === 'playing' ? audioAnalyser.start() : audioAnalyser.stop();
    });

    liveMusicHelper.addEventListener('filtered-prompt', (e) => {
        const filteredPrompt = e.detail;
        toastMessage.show(filteredPrompt.filteredReason);
        pdjMidi.addFilteredPrompt(filteredPrompt.text);
    });

    const infoToast = (e) => {
        const message = e.detail;
        toastMessage.show(message);
    };

    const errorToast = (e) => {
        const error = e.detail;
        toastMessage.show(error);
    };

    liveMusicHelper.addEventListener('error', errorToast);
    pdjMidi.addEventListener('error', errorToast);
    pdjMidi.addEventListener('info', infoToast);

    audioAnalyser.addEventListener('audio-level-changed', (e) => {
        const level = e.detail;
        pdjMidi.audioLevel = level;
    });
}

function buildInitialPrompts() {
    const startOn = [...DEFAULT_PROMPTS]
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

    const prompts = new Map();
    for (let i = 0; i < DEFAULT_PROMPTS.length; i++) {
        const promptId = `prompt-${i}`;
        const prompt = DEFAULT_PROMPTS[i];
        const { text, color } = prompt;
        prompts.set(promptId, {
            promptId,
            text,
            weight: startOn.includes(prompt) ? 1 : 0,
            cc: i,
            color,
        });
    }
    return prompts;
}

const DEFAULT_PROMPTS = [
    { color: '#9900ff', text: 'Bossa Nova' },
    { color: '#5200ff', text: 'Chillwave' },
    { color: '#ff25f6', text: 'Drum and Bass' },
    { color: '#2af6de', text: 'Post Punk' },
    { color: '#ffdd28', text: 'Shoegaze' },
    { color: '#2af6de', text: 'Funk' },
    { color: '#9900ff', text: 'Chiptune' },
    { color: '#3dffab', text: 'Lush Strings' },
    { color: '#d8ff3e', text: 'Sparkling Arpeggios' },
    { color: '#d9b2ff', text: 'Staccato Rhythms' },
    { color: '#3dffab', text: 'Punchy Kick' },
    { color: '#ffdd28', text: 'Dubstep' },
    { color: '#ff25f6', text: 'K Pop' },
    { color: '#d8ff3e', text: 'Neo Soul' },
    { color: '#5200ff', text: 'Trip Hop' },
    { color: '#d9b2ff', text: 'Thrash' },
];

main();
