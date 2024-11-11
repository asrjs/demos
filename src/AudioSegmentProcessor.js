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
            maxAudioDuration: 30,
            logger: console.log,
            ...options
        };

        this.state = {
            inSpeech: false,
            speechStart: null,
            silenceCounter: 0,
            energyHistory: [],
            currentEnergy: 0,
            energyAverage: 0,
            lastSegmentEnd: 0,
            hangoverFrames: 0,
            peakEnergy: 0,
            lastProcessedTime: 0
        };

        this.debugStats = {
            totalFrames: 0,
            speechFrames: 0,
            segmentsCreated: 0
        };
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

    processAudioData(audioData, currentTime) {
        if (!audioData || !audioData.length) return [];

        const maxSamples = this.options.maxAudioDuration * this.options.sampleRate;
        
        let processableData;
        let timeOffset = 0;
        
        if (audioData.length > maxSamples) {
            processableData = audioData.slice(-maxSamples);
            timeOffset = currentTime + (audioData.length - maxSamples) / this.options.sampleRate;
            
            this.log('Processing last 30 seconds of audio', {
                totalDuration: (audioData.length / this.options.sampleRate).toFixed(2),
                processingFrom: timeOffset.toFixed(2)
            });
        } else {
            processableData = audioData;
            timeOffset = currentTime;
        }

        const segments = [];
        let maxEnergy = 0;
        
        for (let i = 0; i < processableData.length; i += this.options.windowSize) {
            const window = processableData.slice(i, Math.min(i + this.options.windowSize, processableData.length));
            if (!window || window.length === 0) continue;

            const energy = this.calculateEnergy(window);
            maxEnergy = Math.max(maxEnergy, energy);
            const isSpeech = this.isSpeech(energy);
            
            const timePoint = timeOffset + i/this.options.sampleRate;
            
            if (timePoint >= this.state.lastSegmentEnd) {
                this.handleStateTransition(isSpeech, i, timePoint, processableData, segments);
            }
        }

        const endTime = timeOffset + processableData.length/this.options.sampleRate;
        if (endTime > this.state.lastProcessedTime) {
            this.state.lastProcessedTime = endTime;
        }

        if (segments.length > 0) {
            this.log("📊 Audio processing summary:", {
                segmentsCreated: segments.length,
                maxEnergy: maxEnergy.toFixed(5),
                threshold: this.options.energyThreshold,
                averageEnergy: this.state.energyAverage?.toFixed(5) || 0,
                processedTime: this.state.lastProcessedTime.toFixed(2)
            });
        }

        return segments;
    }

    calculateEnergy(window) {
        if (!window || !window.length || !Array.isArray(window) && !(window instanceof Float32Array)) {
            return 0;
        }

        try {
            const energy = Math.sqrt(
                window.reduce((sum, sample) => sum + sample * sample, 0) / window.length
            ) * this.options.energyScale;

            if (!this.energyHistory) {
                this.energyHistory = [];
            }

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
        } catch (error) {
            return 0;
        }
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

    handleStateTransition(isSpeech, position, timePoint, audioData, segments) {
        this.state.currentEnergy = this.energyHistory[this.energyHistory.length - 1] || 0;

        if (!this.state.inSpeech && isSpeech) {
            if (timePoint > this.state.lastSegmentEnd) {
                this.state.inSpeech = true;
                this.state.speechStart = position;
                this.state.hangoverFrames = 0;
                
                this.log('Speech start detected', {
                    timePoint: timePoint.toFixed(2),
                    energy: this.state.currentEnergy.toFixed(5),
                    threshold: this.options.energyThreshold.toFixed(5),
                    lastSegmentEnd: this.state.lastSegmentEnd.toFixed(2)
                });
            }
        } else if (this.state.inSpeech && !isSpeech) {
            this.state.silenceCounter += this.options.windowSize;
            
            if (this.state.silenceCounter > (this.options.minSilenceBetween * this.options.sampleRate)) {
                this.state.hangoverFrames += this.options.windowSize;

                if (this.state.hangoverFrames > (this.options.speechHangover * this.options.sampleRate)) {
                    const speechDuration = (position - this.state.speechStart) / this.options.sampleRate;
                    
                    if (speechDuration >= this.options.minSpeechDuration) {
                        const segment = {
                            startTime: timePoint - speechDuration,
                            endTime: timePoint + (this.options.speechHangover / 2),
                            energy: this.state.currentEnergy,
                            audioData: new Float32Array(
                                audioData.slice(
                                    this.state.speechStart,
                                    position + this.options.windowSize
                                )
                            )
                        };

                        this.state.lastSegmentEnd = segment.endTime + 0.1;
                        segments.push(segment);
                        this.debugStats.segmentsCreated++;

                        this.log('Speech segment created', {
                            start: segment.startTime.toFixed(2),
                            end: segment.endTime.toFixed(2),
                            duration: speechDuration.toFixed(2),
                            avgEnergy: this.state.energyAverage.toFixed(5)
                        });
                    }

                    this.state.inSpeech = false;
                    this.state.speechStart = null;
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
            silenceCounter: 0,
            energyHistory: [],
            currentEnergy: 0,
            energyAverage: 0,
            lastSegmentEnd: 0,
            hangoverFrames: 0,
            peakEnergy: 0,
            lastProcessedTime: 0
        };
    }

    setThreshold(threshold) {
        this.options.energyThreshold = threshold;
    }

    setSilenceLength(length) {
        this.options.minSilenceBetween = length;
        this.log('Updated silence length', length);
    }
} 