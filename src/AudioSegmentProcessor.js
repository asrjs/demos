import { SpeechSegment } from './SpeechSegment.js';

export class AudioSegmentProcessor {
    constructor(options = {}) {
        this.options = {
            sampleRate: 16000,
            windowSize: 1600,
            minSpeechDuration: 0.3,
            silenceThreshold: 0.8,
            energyThreshold: 0.02,
            smaLength: 6,
            lookbackChunks: 3,
            overlapDuration: 0.2,
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
        const isSpeech = chunkEnergy > this.options.energyThreshold;

        this.state.recentChunks.push({
            time: bufferStartTime,
            energy: chunkEnergy,
            audio: audioData
        });

        if (this.state.recentChunks.length > this.options.lookbackChunks * 2) {
            this.state.recentChunks.shift();
        }

        if (!this.state.inSpeech && isSpeech) {
            let lookbackIndex = this.state.recentChunks.length - 1;
            let foundStart = false;

            while (lookbackIndex >= 0 && !foundStart) {
                const chunk = this.state.recentChunks[lookbackIndex];
                if (chunk.energy <= this.options.energyThreshold) {
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
            
            this.log('Speech start', {
                time: this.state.speechStartTime.toFixed(2),
                energy: chunkEnergy,
                lookback: bufferStartTime - this.state.speechStartTime
            });
        } else if (this.state.inSpeech && !isSpeech) {
            this.state.silenceCounter++;
            
            if (this.state.silenceCounter >= (this.options.silenceThreshold * 10)) {
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
                            duration: segment.duration.toFixed(2)
                        });
                    }
                }

                this.state.inSpeech = false;
                this.state.speechStartTime = null;
                this.state.silenceCounter = 0;
            }
        } else if (this.state.inSpeech && isSpeech) {
            this.state.silenceCounter = 0;
        }

        return segments;
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