import { SpeechSegment } from './SpeechSegment.js';

export class AudioSegmentProcessor {
    constructor(options = {}) {
        this.options = {
            sampleRate: 16000,
            windowSize: 1600,
            minSpeechDuration: 0.3,
            silenceThreshold: 0.7,
            chunksForSilence: 7,
            energyThreshold: 0.02,
            smaLength: 6,
            lookbackChunks: 3,
            overlapDuration: 0.2,
            maxSilenceStats: 20,
            logger: console.log,
            ...options
        };

        this.reset();
    }

    log(message, data = null) {
        if (typeof this.options.logger === 'function') {
            this.options.logger(message, data);
        }
    }

    processAudioData(audioData, bufferStartTime, chunkEnergy) {
        if (!audioData || !audioData.length) return [];

        const segments = [];
        const isSpeech = chunkEnergy > this.getAdaptiveThreshold();

        this.state.recentChunks.push({
            time: bufferStartTime,
            energy: chunkEnergy,
            audio: audioData
        });

        if (this.state.recentChunks.length > this.options.lookbackChunks * 2) {
            this.state.recentChunks.shift();
        }

        if (!this.state.inSpeech && isSpeech) {
            if (this.state.currentSilence) {
                this.updateSilenceStats(this.state.currentSilence);
            }

            let lookbackIndex = this.state.recentChunks.length - 1;
            let foundStart = false;

            while (lookbackIndex >= 0 && !foundStart) {
                const chunk = this.state.recentChunks[lookbackIndex];
                if (chunk.energy <= this.getAdaptiveThreshold()) {
                    foundStart = true;
                    this.state.speechStartTime = chunk.time;
                } else {
                    lookbackIndex--;
                }
            }

            if (!foundStart) {
                this.state.speechStartTime = bufferStartTime;
            }

            this.state.inSpeech = true;
            this.state.silenceCounter = 0;
            this.state.currentSilence = null;

            this.log('Speech start', {
                time: this.state.speechStartTime.toFixed(2),
                energy: chunkEnergy,
                lookback: bufferStartTime - this.state.speechStartTime,
                adaptiveThreshold: this.getAdaptiveThreshold()
            });
        } else if (this.state.inSpeech && !isSpeech) {
            this.state.silenceCounter++;
            
            if (!this.state.currentSilence) {
                this.state.currentSilence = {
                    startTime: bufferStartTime,
                    energies: [],
                    duration: 0
                };
            }
            
            this.state.currentSilence.energies.push(chunkEnergy);
            this.state.currentSilence.duration = 
                bufferStartTime - this.state.currentSilence.startTime;

            if (this.state.silenceCounter >= this.options.chunksForSilence) {
                const duration = bufferStartTime - this.state.speechStartTime;
                
                if (duration >= this.options.minSpeechDuration) {
                    const segment = this.createSegment(
                        this.state.speechStartTime,
                        bufferStartTime,
                        this.state.recentChunks
                    );

                    if (segment) {
                        segments.push(segment);
                        this.log('Speech segment created', {
                            start: segment.startTime.toFixed(2),
                            end: segment.endTime.toFixed(2),
                            duration: segment.duration.toFixed(2),
                            silenceStats: this.getSilenceStats()
                        });
                    }
                }

                this.state.inSpeech = false;
                this.state.speechStartTime = null;
                this.state.silenceCounter = 0;
            }
        } else if (this.state.inSpeech && isSpeech) {
            this.state.silenceCounter = 0;
            this.state.currentSilence = null;
        }

        return segments;
    }

    updateSilenceStats(silence) {
        this.state.silenceStats.push({
            duration: silence.duration,
            avgEnergy: silence.energies.reduce((a, b) => a + b, 0) / silence.energies.length,
            timestamp: Date.now()
        });

        if (this.state.silenceStats.length > this.options.maxSilenceStats) {
            this.state.silenceStats.shift();
        }

        this.log('Silence stats updated', {
            stats: this.getSilenceStats(),
            currentSilence: silence
        });
    }

    getSilenceStats() {
        if (this.state.silenceStats.length === 0) return null;

        const stats = {
            avgDuration: 0,
            avgEnergy: 0,
            minDuration: Infinity,
            maxDuration: 0,
            count: this.state.silenceStats.length
        };

        this.state.silenceStats.forEach(s => {
            stats.avgDuration += s.duration;
            stats.avgEnergy += s.avgEnergy;
            stats.minDuration = Math.min(stats.minDuration, s.duration);
            stats.maxDuration = Math.max(stats.maxDuration, s.duration);
        });

        stats.avgDuration /= stats.count;
        stats.avgEnergy /= stats.count;

        return stats;
    }

    getAdaptiveThreshold() {
        const stats = this.getSilenceStats();
        if (!stats || stats.count < 3) {
            return this.options.energyThreshold;
        }

        return stats.avgEnergy * 1.5;
    }

    createSegment(startTime, endTime, chunks) {
        const relevantChunks = chunks.filter(chunk => 
            chunk.time >= startTime - this.options.overlapDuration && 
            chunk.time <= endTime
        );

        if (relevantChunks.length === 0) return null;

        const totalSamples = relevantChunks.reduce((sum, chunk) => 
            sum + chunk.audio.length, 0
        );

        const combinedAudio = new Float32Array(totalSamples);
        let offset = 0;

        relevantChunks.forEach(chunk => {
            combinedAudio.set(chunk.audio, offset);
            offset += chunk.audio.length;
        });

        return {
            startTime: startTime - this.options.overlapDuration,
            endTime: endTime,
            audioData: combinedAudio,
            sampleRate: this.options.sampleRate,
            duration: endTime - startTime + this.options.overlapDuration
        };
    }

    reset() {
        this.state = {
            inSpeech: false,
            speechStartTime: null,
            silenceCounter: 0,
            recentChunks: [],
            silenceStats: [],
            currentSilence: null,
            energyValues: []
        };
    }

    setThreshold(threshold) {
        this.options.energyThreshold = threshold;
    }

    setSilenceLength(length) {
        this.options.silenceThreshold = length;
    }
} 