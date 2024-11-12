import { SpeechSegment } from './SpeechSegment.js';

export class AudioSegmentProcessor {
    constructor(options = {}) {
        this.options = {
            sampleRate: 16000,
            windowSize: 256,
            minSpeechDuration: 0.1,
            minSilenceBetween: 0.3,
            energyThreshold: 0.02,
            energyScale: 2,
            speechHangover: 0.2,
            hysteresisRatio: 1.2,
            movingAverageWindow: 10,
            logger: console.log,
            ...options
        };

        this.reset();
    }

    log(message, data = null) {
        if (typeof this.options.logger === 'function') {
            if (data) {
                this.options.logger(message, data);
            } else {
                this.options.logger(message);
            }
        }
    }

    processAudioData(audioData, bufferStartTime) {
        if (!audioData || !audioData.length) return [];

        this.state.totalProcessedSamples = Math.max(
            this.state.totalProcessedSamples,
            bufferStartTime * this.options.sampleRate + audioData.length
        );

        const segments = [];
        let maxEnergy = 0;

        for (let i = 0; i < audioData.length; i += this.options.windowSize) {
            const window = audioData.slice(i, Math.min(i + this.options.windowSize, audioData.length));
            if (!window || window.length === 0) continue;

            const energy = this.calculateEnergy(window);
            maxEnergy = Math.max(maxEnergy, energy);
            const isSpeech = this.isSpeech(energy);

            const absoluteTimePoint = bufferStartTime + (i / this.options.sampleRate);

            this.handleStateTransition(isSpeech, i, absoluteTimePoint, audioData, segments, bufferStartTime);
        }

        if (segments.length > 0) {
            this.log("📊 Audio processing summary:", {
                segmentsCreated: segments.length,
                maxEnergy: maxEnergy.toFixed(5),
                threshold: this.options.energyThreshold,
                averageEnergy: this.state.energyAverage?.toFixed(5) || 0,
                totalTime: (this.state.totalProcessedSamples / this.options.sampleRate).toFixed(2),
                bufferStartTime: bufferStartTime.toFixed(2)
            });
        }

        return segments;
    }

    calculateEnergy(window) {
        if (!window || !window.length || !Array.isArray(window) && !(window instanceof Float32Array)) {
            return 0;
        }

        const energy = Math.sqrt(
            window.reduce((sum, sample) => sum + sample * sample, 0) / window.length
        ) * this.options.energyScale;

        if (this.energyHistory.length > 50) {
            this.energyHistory.shift();
        }
        this.energyHistory.push(energy);

        const start = Math.max(0, this.energyHistory.length - this.options.movingAverageWindow);
        const recentEnergies = this.energyHistory.slice(start);
        const smoothedEnergy = recentEnergies.reduce((acc, val) => acc + val, 0) / recentEnergies.length;

        this.state.peakEnergy = Math.max(this.state.peakEnergy, smoothedEnergy);
        this.state.energyAverage = smoothedEnergy;

        return smoothedEnergy;
    }

    isSpeech(energy) {
        this.debugStats.totalFrames++;

        const baseThreshold = Math.max(
            this.options.energyThreshold,
            this.state.energyAverage * 0.8
        );

        const threshold = this.state.inSpeech ?
            baseThreshold :
            baseThreshold * this.options.hysteresisRatio;

        const isSpeech = energy > threshold;

        if (isSpeech) {
            this.debugStats.speechFrames++;
        }

        return isSpeech;
    }

    handleStateTransition(isSpeech, position, absoluteTimePoint, audioData, segments, bufferStartTime) {
        this.state.currentEnergy = this.energyHistory[this.energyHistory.length - 1] || 0;

        if (!this.state.inSpeech && isSpeech) {
            this.state.inSpeech = true;
            this.state.speechStart = position;
            this.state.speechStartTime = absoluteTimePoint;
            this.state.hangoverFrames = 0;

            this.log('Speech start detected', {
                absoluteTime: absoluteTimePoint.toFixed(2),
                bufferTime: (position / this.options.sampleRate).toFixed(2),
                energy: this.state.currentEnergy.toFixed(5),
                threshold: this.options.energyThreshold.toFixed(5)
            });
        } else if (this.state.inSpeech && !isSpeech) {
            this.state.silenceCounter += this.options.windowSize;

            if (this.state.silenceCounter > (this.options.minSilenceBetween * this.options.sampleRate)) {
                this.state.hangoverFrames += this.options.windowSize;

                if (this.state.hangoverFrames > (this.options.speechHangover * this.options.sampleRate)) {
                    const speechDuration = (position - this.state.speechStart) / this.options.sampleRate;

                    if (speechDuration >= this.options.minSpeechDuration) {
                        const segment = {
                            startTime: this.state.speechStartTime,
                            endTime: absoluteTimePoint + (this.options.speechHangover / 2),
                            energy: this.state.currentEnergy,
                            audioData: new Float32Array(
                                audioData.slice(
                                    this.state.speechStart,
                                    position + this.options.windowSize
                                )
                            )
                        };

                        segments.push(segment);
                        this.debugStats.segmentsCreated++;

                        this.log('Speech segment created', {
                            absoluteStart: segment.startTime.toFixed(2),
                            absoluteEnd: segment.endTime.toFixed(2),
                            bufferStart: (this.state.speechStart / this.options.sampleRate).toFixed(2),
                            bufferEnd: (position / this.options.sampleRate).toFixed(2),
                            duration: speechDuration.toFixed(2),
                            avgEnergy: this.state.energyAverage.toFixed(5)
                        });
                    }

                    this.state.inSpeech = false;
                    this.state.speechStart = null;
                    this.state.speechStartTime = null;
                    this.state.silenceCounter = 0;
                    this.state.hangoverFrames = 0;
                    this.state.peakEnergy = 0;
                }
            }
        } else if (this.state.inSpeech && isSpeech) {
            this.state.silenceCounter = 0;
            this.state.hangoverFrames = 0;
        }
    }

    reset() {
        this.state = {
            inSpeech: false,
            speechStart: null,
            speechStartTime: null,
            silenceCounter: 0,
            currentEnergy: 0,
            energyAverage: 0,
            hangoverFrames: 0,
            peakEnergy: 0,
            totalProcessedSamples: 0
        };

        this.debugStats = {
            totalFrames: 0,
            speechFrames: 0,
            segmentsCreated: 0
        };

        this.energyHistory = [];
    }

    setThreshold(threshold) {
        this.options.energyThreshold = threshold;
    }

    setSilenceLength(length) {
        this.options.minSilenceBetween = length;
        this.log('Updated silence length', length);
    }
} 