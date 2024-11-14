import { SpeechSegment } from './SpeechSegment.js';

export class AudioSegmentProcessor {
    constructor(options = {}) {
        this.options = {
            sampleRate: 16000,
            windowSize: 256,
            minSpeechDuration: 0.3,
            minSilenceBetween: 0.3,
            energyThreshold: 0.02,
            energyScale: 2,
            speechHangover: 0.3,
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

        const segments = [];
        let maxEnergy = 0;

        for (let i = 0; i < audioData.length; i += this.options.windowSize) {
            const window = audioData.slice(i, Math.min(i + this.options.windowSize, audioData.length));
            if (!window || window.length === 0) continue;

            const energy = this.calculateEnergy(window);
            maxEnergy = Math.max(maxEnergy, energy);
            const isSpeech = this.isSpeech(energy);

            const absoluteTimePoint = bufferStartTime + (i / this.options.sampleRate);

            if (absoluteTimePoint >= this.state.lastSegmentEnd) {
                this.handleStateTransition(isSpeech, i, absoluteTimePoint, audioData, segments);
            }
        }

        if (segments.length > 0) {
            this.log("📊 Audio processing summary:", {
                segmentsCreated: segments.length,
                maxEnergy: maxEnergy.toFixed(5),
                startTime: bufferStartTime.toFixed(2),
                endTime: (bufferStartTime + audioData.length / this.options.sampleRate).toFixed(2)
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

    handleStateTransition(isSpeech, position, absoluteTimePoint, audioData, segments) {
        this.state.currentEnergy = this.energyHistory[this.energyHistory.length - 1] || 0;

        const timeSinceLastSpeech = absoluteTimePoint - this.state.lastSegmentEnd;
        const canStartNewSpeech = !this.state.inSpeech && 
            (this.state.lastSegmentEnd === 0 || timeSinceLastSpeech >= this.options.minSilenceBetween);

        const debugState = {
            inSpeech: this.state.inSpeech,
            silenceCounter: this.state.silenceCounter / this.options.sampleRate,
            minSilenceBetween: this.options.minSilenceBetween,
            hangoverFrames: this.state.hangoverFrames / this.options.sampleRate,
            speechHangover: this.options.speechHangover,
            currentEnergy: this.state.currentEnergy,
            isSpeech
        };

        if (canStartNewSpeech && isSpeech) {
            this.state.inSpeech = true;
            this.state.speechStart = position;
            this.state.speechStartTime = absoluteTimePoint;
            this.state.hangoverFrames = 0;
            this.state.silenceCounter = 0;

            this.log('Speech start detected', {
                absoluteTime: absoluteTimePoint.toFixed(2),
                timeSinceLastSpeech: timeSinceLastSpeech.toFixed(2),
                energy: this.state.currentEnergy.toFixed(5),
                threshold: this.options.energyThreshold.toFixed(5)
            });
        } else if (this.state.inSpeech && !isSpeech) {
            this.state.silenceCounter += this.options.windowSize;
            
            console.log('Silence detected during speech:', {
                silenceCounter: (this.state.silenceCounter / this.options.sampleRate).toFixed(2),
                requiredSilence: this.options.minSilenceBetween,
                hangoverFrames: (this.state.hangoverFrames / this.options.sampleRate).toFixed(2),
                requiredHangover: this.options.speechHangover,
                energy: this.state.currentEnergy.toFixed(5)
            });

            if (this.state.silenceCounter >= (this.options.minSilenceBetween * this.options.sampleRate)) {
                this.state.hangoverFrames += this.options.windowSize;

                if (this.state.hangoverFrames >= (this.options.speechHangover * this.options.sampleRate)) {
                    const speechDuration = (position - this.state.speechStart) / this.options.sampleRate;

                    if (speechDuration >= this.options.minSpeechDuration) {
                        const segmentDuration = absoluteTimePoint - this.state.speechStartTime;
                        const totalSamples = Math.floor(segmentDuration * this.options.sampleRate);
                        
                        const segmentStartSample = this.state.speechStart;
                        const segmentEndSample = Math.min(
                            segmentStartSample + totalSamples,
                            audioData.length
                        );

                        if (segmentEndSample > segmentStartSample) {
                            const segmentLength = segmentEndSample - segmentStartSample;
                            const segmentAudio = new Float32Array(segmentLength);
                            
                            for (let i = 0; i < segmentLength; i++) {
                                segmentAudio[i] = audioData[segmentStartSample + i] || 0;
                            }

                            const segment = {
                                startTime: this.state.speechStartTime,
                                endTime: absoluteTimePoint,
                                energy: this.state.currentEnergy,
                                audioData: segmentAudio,
                                sampleRate: this.options.sampleRate,
                                startSample: segmentStartSample,
                                endSample: segmentEndSample,
                                duration: segmentDuration,
                                bufferPosition: position,
                                samples: segmentLength
                            };

                            console.log('Creating segment with audio:', {
                                startTime: segment.startTime.toFixed(2),
                                endTime: segment.endTime.toFixed(2),
                                duration: segmentDuration.toFixed(2),
                                expectedSamples: totalSamples,
                                actualSamples: segmentLength,
                                sampleRate: this.options.sampleRate
                            });

                            segments.push(segment);
                            this.state.lastSegmentEnd = absoluteTimePoint;
                            this.debugStats.segmentsCreated++;

                            this.log('Speech segment created', {
                                absoluteStart: segment.startTime.toFixed(2),
                                absoluteEnd: segment.endTime.toFixed(2),
                                duration: segmentDuration.toFixed(2),
                                samples: `${segmentStartSample}-${segmentEndSample}`,
                                totalSamples: segmentLength,
                                avgEnergy: this.state.energyAverage.toFixed(5)
                            });
                        }
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

        if (this.state.inSpeech) {
            console.log('Speech state:', {
                ...debugState,
                duration: ((position - this.state.speechStart) / this.options.sampleRate).toFixed(2)
            });
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
            lastSegmentEnd: 0
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