export class AudioSegmentProcessor {
    constructor(options = {}) {
        this.options = {
            sampleRate: 16000,
            windowSize: 256,
            minSpeechDuration: 0.5,
            minSilenceBetween: 0.8,
            energyThreshold: 0.02,
            energyScale: 2,
            maxSilenceWithinSpeech: 0.3,
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
            lastSpeechEnd: null,
            continuingSpeech: false
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
        // Add more robust checks for window data
        if (!window || !window.length || !Array.isArray(window) && !(window instanceof Float32Array)) {
            console.log("Invalid window data:", {
                exists: !!window,
                type: window ? typeof window : 'undefined',
                isArray: Array.isArray(window),
                isFloat32Array: window instanceof Float32Array,
                length: window?.length
            });
            return 0;
        }
        
        try {
            const energy = Math.sqrt(
                window.reduce((sum, sample) => sum + sample * sample, 0) / window.length
            ) * this.options.energyScale;
            
            // Update background energy with longer history
            if (!this.energyHistory) {
                this.energyHistory = [];
            }
            
            if (this.energyHistory.length > 50) {
                this.energyHistory.shift();
            }
            this.energyHistory.push(energy);
            
            // Use median for more stable background estimation
            const sortedEnergies = [...this.energyHistory].sort((a, b) => a - b);
            this.energyAverage = sortedEnergies[Math.floor(sortedEnergies.length / 2)];
            
            return energy;
        } catch (error) {
            console.error("Energy calculation error:", error, {
                windowData: window?.slice(0, 5),  // Log first 5 samples for debugging
                windowLength: window?.length,
                windowType: typeof window
            });
            return 0;
        }
    }

    isSpeech(energy) {
        this.debugStats.totalFrames++;
        const dynamicThreshold = Math.max(
            this.options.energyThreshold,
            this.energyAverage * 1.1
        );
        
        const isSpeech = energy > dynamicThreshold;
        if (isSpeech) {
            this.debugStats.speechFrames++;
        }
        
        return isSpeech;
    }

    handleStateTransition(isSpeech, position, timePoint, audioData, segments) {
        this.state.currentEnergy = this.energyHistory[this.energyHistory.length - 1] || 0;

        if (!this.state.inSpeech && isSpeech) {
            // Check if this is continuation of previous speech
            const timeSinceLastSpeech = this.state.lastSpeechEnd ? 
                timePoint - this.state.lastSpeechEnd : 
                Infinity;

            if (timeSinceLastSpeech < this.options.maxSilenceWithinSpeech) {
                // Continue previous speech segment
                this.state.speechStart = this.state.lastSegmentEnd;
                this.state.continuingSpeech = true;
            } else {
                // Start new speech segment
                this.state.speechStart = position;
                this.state.continuingSpeech = false;
            }

            this.state.inSpeech = true;
            this.log('Speech activity detected', {
                timePoint: timePoint.toFixed(2),
                continuing: this.state.continuingSpeech
            });

        } else if (this.state.inSpeech && !isSpeech) {
            // In speech but detected silence
            this.state.silenceCounter += this.options.windowSize;
            this.state.lastSpeechEnd = timePoint;
            
            // Use different silence thresholds for within-speech and between-speech
            const silenceThreshold = this.state.continuingSpeech ? 
                this.options.maxSilenceWithinSpeech * this.options.sampleRate :
                this.options.minSilenceBetween * this.options.sampleRate;

            if (this.state.silenceCounter > silenceThreshold) {
                const speechDuration = (position - this.state.speechStart) / this.options.sampleRate;
                
                if (speechDuration >= this.options.minSpeechDuration) {
                    const segment = {
                        startTime: this.state.continuingSpeech ? 
                            this.state.speechStart / this.options.sampleRate : 
                            timePoint - speechDuration,
                        endTime: timePoint,
                        energy: this.state.currentEnergy,
                        audioData: new Float32Array(
                            audioData.slice(
                                this.state.speechStart,
                                position + this.options.windowSize
                            )
                        )
                    };

                    this.state.lastSegmentEnd = timePoint;

                    this.log('Speech segment created', {
                        start: segment.startTime.toFixed(2),
                        end: segment.endTime.toFixed(2),
                        duration: (segment.endTime - segment.startTime).toFixed(2),
                        continuing: this.state.continuingSpeech
                    });

                    segments.push(segment);
                    this.debugStats.segmentsCreated++;
                }

                // Reset state
                this.state.inSpeech = false;
                this.state.speechStart = null;
                this.state.silenceCounter = 0;
                this.state.continuingSpeech = false;
            }
        } else if (this.state.inSpeech && isSpeech) {
            // Still in speech, reset silence counter
            this.state.silenceCounter = 0;
            this.state.lastSpeechEnd = timePoint;
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
            lastSpeechEnd: null,
            continuingSpeech: false
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