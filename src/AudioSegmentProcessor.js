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

        this.state = {
            inSpeech: false,
            speechStart: null,
            silenceCounter: 0,
            energyHistory: [],
            currentEnergy: 0,
            energyAverage: 0,
            lastSegmentEnd: 0,
            hangoverFrames: 0,
            peakEnergy: 0
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

        const segments = [];
        let maxEnergy = 0;
        
        // Process audio in windows
        for (let i = 0; i < audioData.length; i += this.options.windowSize) {
            const window = audioData.slice(i, Math.min(i + this.options.windowSize, audioData.length));
            if (!window || window.length === 0) continue;

            const energy = this.calculateEnergy(window);
            maxEnergy = Math.max(maxEnergy, energy);
            const isSpeech = this.isSpeech(energy);
            
            const timePoint = currentTime + i/this.options.sampleRate;
            // Only process if we're past the last segment's end time
            if (timePoint > this.state.lastSegmentEnd) {
                this.handleStateTransition(isSpeech, i, timePoint, audioData, segments);
            }
        }

        // Only log if segments were created
        if (segments.length > 0) {
            console.log("📊 Audio processing summary:", {
                segmentsCreated: segments.length,
                maxEnergy: maxEnergy.toFixed(5),
                threshold: this.options.energyThreshold,
                averageEnergy: this.energyAverage?.toFixed(5) || 0
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

            // Update energy history
            if (!this.energyHistory) {
                this.energyHistory = [];
            }

            if (this.energyHistory.length > 50) {
                this.energyHistory.shift();
            }
            this.energyHistory.push(energy);

            // Use moving average for smoothing
            const start = Math.max(0, this.energyHistory.length - this.options.movingAverageWindow);
            const recentEnergies = this.energyHistory.slice(start);
            const smoothedEnergy = recentEnergies.reduce((acc, val) => acc + val, 0) / recentEnergies.length;

            // Update peak energy
            this.state.peakEnergy = Math.max(this.state.peakEnergy, smoothedEnergy);
            this.state.energyAverage = smoothedEnergy;

            return smoothedEnergy;
        } catch (error) {
            return 0;
        }
    }

    isSpeech(energy) {
        this.debugStats.totalFrames++;

        // Dynamic threshold with hysteresis
        const baseThreshold = Math.max(
            this.options.energyThreshold,
            this.state.energyAverage * 0.8  // Base threshold relative to average
        );

        // Apply hysteresis: higher threshold for starting speech, lower for continuing
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
            // Transition: Silence -> Speech
            this.state.inSpeech = true;
            this.state.speechStart = position;
            this.state.hangoverFrames = 0;
            
            this.log('Speech start detected', {
                timePoint: timePoint.toFixed(2),
                energy: this.state.currentEnergy.toFixed(5),
                threshold: this.options.energyThreshold.toFixed(5)
            });

        } else if (this.state.inSpeech && !isSpeech) {
            // In speech but detected silence
            this.state.silenceCounter += this.options.windowSize;
            
            // Apply hangover period
            if (this.state.silenceCounter > (this.options.minSilenceBetween * this.options.sampleRate)) {
                this.state.hangoverFrames += this.options.windowSize;

                // Only end speech after hangover period
                if (this.state.hangoverFrames > (this.options.speechHangover * this.options.sampleRate)) {
                    const speechDuration = (position - this.state.speechStart) / this.options.sampleRate;
                    
                    if (speechDuration >= this.options.minSpeechDuration) {
                        const segment = {
                            startTime: timePoint - speechDuration,
                            endTime: timePoint + (this.options.speechHangover / 2), // Add half hangover to end
                            energy: this.state.currentEnergy,
                            audioData: new Float32Array(
                                audioData.slice(
                                    this.state.speechStart,
                                    position + this.options.windowSize
                                )
                            )
                        };

                        this.state.lastSegmentEnd = segment.endTime;
                        segments.push(segment);
                        this.debugStats.segmentsCreated++;

                        this.log('Speech segment created', {
                            start: segment.startTime.toFixed(2),
                            end: segment.endTime.toFixed(2),
                            duration: speechDuration.toFixed(2),
                            avgEnergy: this.state.energyAverage.toFixed(5)
                        });
                    }

                    // Reset state
                    this.state.inSpeech = false;
                    this.state.speechStart = null;
                    this.state.silenceCounter = 0;
                    this.state.hangoverFrames = 0;
                    this.state.peakEnergy = 0;
                }
            }
        } else if (this.state.inSpeech && isSpeech) {
            // Still in speech, reset counters
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
            peakEnergy: 0
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