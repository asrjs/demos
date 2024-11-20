import { SpeechSegment } from './SpeechSegment.js';

export class AudioSegmentProcessor {
    constructor(options = {}) {
        this.options = {
            sampleRate: 16000,
            windowSize: 1600,
            minSpeechDuration: 0.3,
            silenceThreshold: 0.6,
            energyThreshold: 0.02,
            processingInterval: 0.1,
            smaLength: 6,
            lookbackChunks: 3,
            overlapDuration: 0.2,
            maxHistoryLength: 10,
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

    processAudioData(chunk, currentTime, energy, fullAudioBuffer, lastProcessedTime) {
        if (!chunk || !chunk.length) return [];

        const segments = [];
        const isSpeech = energy > this.options.energyThreshold;

        const chunkDuration = chunk.length / this.options.sampleRate;
        
        this.state.recentChunks.push({
            time: currentTime,
            energy: energy,
            isSpeech: isSpeech,
            duration: chunkDuration
        });

        if (this.state.recentChunks.length > 10) {
            this.state.recentChunks.shift();
        }

        if (!this.state.inSpeech && isSpeech) {
            let realStartIndex = this.findSpeechStart();
            let realStartTime = realStartIndex !== -1 
                ? this.state.recentChunks[realStartIndex].time 
                : currentTime;

            this.startSpeech(realStartTime, energy);
            
            this.log('Speech start detected', {
                detectedAt: currentTime.toFixed(2),
                actualStart: realStartTime.toFixed(2),
                lookbackDiff: (currentTime - realStartTime).toFixed(2)
            });
        } else if (this.state.inSpeech && !isSpeech) {
            this.state.silenceDuration += chunkDuration;
            
            if (this.state.silenceDuration >= this.options.silenceThreshold) {
                this.log('Silence threshold reached', {
                    silenceDuration: this.state.silenceDuration.toFixed(2),
                    threshold: this.options.silenceThreshold.toFixed(2)
                });

                if (this.state.speechStartTime !== null) {
                    const segment = this.createSegment(
                        this.state.speechStartTime - (this.options.silenceThreshold / 2),
                        currentTime + (this.options.silenceThreshold / 2),
                        fullAudioBuffer,
                        this.options.sampleRate
                    );

                    if (segment) {
                        segments.push(segment);
                    }
                }

                this.startSilence(currentTime);
            }
        } else {
            if (this.state.inSpeech) {
                this.state.speechEnergies.push(energy);
                this.state.silenceDuration = 0;
            } else {
                this.state.silenceEnergies.push(energy);
            }
        }

        this.updateStats();

        return segments;
    }

    startSpeech(time, energy) {
        this.state.inSpeech = true;
        this.state.speechStartTime = time;
        this.state.silenceDuration = 0;
        this.state.speechEnergies = [energy];
        this.state.silenceStartTime = null;
    }

    startSilence(time) {
        this.state.inSpeech = false;
        this.state.silenceStartTime = time;
        this.state.speechStartTime = null;
        this.state.silenceDuration = 0;
        this.state.silenceEnergies = [];
    }

    updateStats() {
        const stats = {
            silence: {
                avgDuration: 0,
                avgEnergy: 0,
                avgEnergyIntegral: 0
            },
            speech: {
                avgDuration: 0,
                avgEnergy: 0,
                avgEnergyIntegral: 0
            }
        };

        if (this.state.silenceStats.length > 0) {
            stats.silence = {
                avgDuration: this.average(this.state.silenceStats.map(s => s.duration)),
                avgEnergy: this.average(this.state.silenceStats.map(s => s.avgEnergy)),
                avgEnergyIntegral: this.average(this.state.silenceStats.map(s => s.energyIntegral))
            };
        }

        if (this.state.speechStats.length > 0) {
            stats.speech = {
                avgDuration: this.average(this.state.speechStats.map(s => s.duration)),
                avgEnergy: this.average(this.state.speechStats.map(s => s.avgEnergy)),
                avgEnergyIntegral: this.average(this.state.speechStats.map(s => s.energyIntegral))
            };
        }

        this.state.currentStats = stats;
    }

    average(arr) {
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    getStats() {
        return this.state.currentStats;
    }

    reset() {
        this.state = {
            inSpeech: false,
            speechStartTime: null,
            silenceStartTime: null,
            silenceDuration: 0,
            recentChunks: [],
            speechEnergies: [],
            silenceEnergies: [],
            speechStats: [],
            silenceStats: [],
            currentStats: {
                silence: { avgDuration: 0, avgEnergy: 0, avgEnergyIntegral: 0 },
                speech: { avgDuration: 0, avgEnergy: 0, avgEnergyIntegral: 0 }
            }
        };
    }

    setThreshold(threshold) {
        this.options.energyThreshold = threshold;
    }

    setSilenceLength(length) {
        console.log('Setting silence threshold to:', length, 'seconds');
        this.options.silenceThreshold = length;
    }

    createSegment(startTime, endTime, fullAudioBuffer, sampleRate) {
        const lookbackDuration = 0.3;  // 300ms pre-silence padding
        const overlapDuration = 0.3;   // 300ms post-silence padding
        
        const lookbackSamples = Math.floor(lookbackDuration * sampleRate);
        const overlapSamples = Math.floor(overlapDuration * sampleRate);
        
        const startSample = Math.floor(startTime * sampleRate);
        const endSample = Math.floor(endTime * sampleRate);
        
        const segmentStartSample = Math.max(0, startSample - lookbackSamples);
        const segmentEndSample = Math.min(fullAudioBuffer.length, endSample + overlapSamples);
        
        if (segmentStartSample >= fullAudioBuffer.length || segmentEndSample <= 0) {
            this.log('Invalid segment boundaries', {
                start: startTime,
                end: endTime,
                startSample: segmentStartSample,
                endSample: segmentEndSample,
                bufferLength: fullAudioBuffer.length,
                lookback: lookbackDuration,
                overlap: overlapDuration
            });
            return null;
        }

        const segmentLength = segmentEndSample - segmentStartSample;
        
        if (segmentLength <= 0) {
            this.log('Invalid segment length', {
                length: segmentLength,
                start: startTime,
                end: endTime
            });
            return null;
        }

        const segmentAudio = new Float32Array(segmentLength);
        segmentAudio.set(
            fullAudioBuffer.slice(segmentStartSample, segmentEndSample)
        );

        const segment = new SpeechSegment({
            startTime: startTime - lookbackDuration,  
            endTime: endTime + overlapDuration,      
            audioData: segmentAudio,
            sampleRate: sampleRate,
            energy: this.state.speechEnergies.reduce((a, b) => a + b, 0) / 
                    this.state.speechEnergies.length,
            isProcessed: false,
            isMerged: false,
            isPartOfMerged: false
        });

        this.log('Created segment', {
            originalStart: startTime.toFixed(2),
            originalEnd: endTime.toFixed(2),
            finalStart: segment.startTime.toFixed(2),
            finalEnd: segment.endTime.toFixed(2),
            duration: (segment.endTime - segment.startTime).toFixed(2),
            samples: segmentLength,
            lookbackSamples,
            overlapSamples
        });

        return segment;
    }

    findSpeechStart() {
        const chunks = this.state.recentChunks;
        let startIndex = chunks.length - 1;
        
        while (startIndex >= 0) {
            if (!chunks[startIndex].isSpeech) {
                let silentCount = 0;
                while (startIndex >= 0 && !chunks[startIndex].isSpeech) {
                    silentCount++;
                    startIndex--;
                }
                if (silentCount >= 3) {
                    return startIndex + 1;
                }
            }
            startIndex--;
        }
        return 0;
    }
} 