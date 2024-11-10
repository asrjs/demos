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
            endingSpeechTolerance: 0.4,
            endingEnergyThreshold: 0.6,
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
            continuingSpeech: false,
            peakEnergy: 0,
            endingPhase: false
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
        
        // Update peak energy
        if (this.state.currentEnergy > this.state.peakEnergy) {
            this.state.peakEnergy = this.state.currentEnergy;
        }

        if (!this.state.inSpeech && isSpeech) {
            // Check if this is continuation of previous speech
            const timeSinceLastSpeech = this.state.lastSpeechEnd ? 
                timePoint - this.state.lastSpeechEnd : 
                Infinity;

            if (timeSinceLastSpeech < this.options.maxSilenceWithinSpeech) {
                // Continue previous speech segment - Fix: use timePoint-based calculation
                const samplesFromStart = Math.floor(this.state.lastSegmentEnd * this.options.sampleRate);
                this.state.speechStart = samplesFromStart;
                this.state.continuingSpeech = true;
            } else {
                // Start new speech segment
                this.state.speechStart = position;
                this.state.continuingSpeech = false;
            }

            this.state.inSpeech = true;
            this.log('Speech activity detected', {
                timePoint: timePoint.toFixed(2),
                continuing: this.state.continuingSpeech,
                speechStart: (this.state.speechStart / this.options.sampleRate).toFixed(2)
            });

            this.state.endingPhase = false;
            this.state.peakEnergy = this.state.currentEnergy;

        } else if (this.state.inSpeech && !isSpeech) {
            // In speech but detected silence
            this.state.silenceCounter += this.options.windowSize;
            this.state.lastSpeechEnd = timePoint;
            
            // Check if we're in ending phase
            const isEndingEnergy = this.state.currentEnergy > 
                (this.state.peakEnergy * this.options.endingEnergyThreshold);

            if (isEndingEnergy) {
                // Reset silence counter if we detect significant ending energy
                this.state.silenceCounter = 0;
                this.state.endingPhase = true;
            }

            // Use different thresholds based on whether we're in ending phase
            const silenceThreshold = this.state.endingPhase ?
                this.options.endingSpeechTolerance * this.options.sampleRate :
                this.state.continuingSpeech ? 
                    this.options.maxSilenceWithinSpeech * this.options.sampleRate :
                    this.options.minSilenceBetween * this.options.sampleRate;

            if (this.state.silenceCounter > silenceThreshold) {
                const speechDuration = (position - this.state.speechStart) / this.options.sampleRate;
                
                if (speechDuration >= this.options.minSpeechDuration) {
                    // Fix: Ensure start time is never before last segment end
                    const startTime = this.state.continuingSpeech ? 
                        Math.max(
                            this.state.lastSegmentEnd,
                            this.state.speechStart / this.options.sampleRate
                        ) : 
                        timePoint - speechDuration;

                    const segment = {
                        startTime: startTime,
                        endTime: timePoint + (this.state.endingPhase ? this.options.endingSpeechTolerance : 0),
                        energy: this.state.currentEnergy,
                        audioData: new Float32Array(
                            audioData.slice(
                                this.state.speechStart,
                                position + this.options.windowSize
                            )
                        )
                    };

                    // Validate segment times
                    if (segment.startTime >= this.state.lastSegmentEnd && segment.endTime > segment.startTime) {
                        this.state.lastSegmentEnd = segment.endTime;
                        segments.push(segment);
                        this.debugStats.segmentsCreated++;

                        this.log('Speech segment created', {
                            start: segment.startTime.toFixed(2),
                            end: segment.endTime.toFixed(2),
                            duration: (segment.endTime - segment.startTime).toFixed(2),
                            continuing: this.state.continuingSpeech,
                            hadEndingPhase: this.state.endingPhase
                        });
                    } else {
                        this.log('Invalid segment times', {
                            start: segment.startTime.toFixed(2),
                            end: segment.endTime.toFixed(2),
                            lastEnd: this.state.lastSegmentEnd.toFixed(2)
                        });
                    }
                }

                // Reset state
                this.state.inSpeech = false;
                this.state.speechStart = null;
                this.state.silenceCounter = 0;
                this.state.continuingSpeech = false;
                this.state.endingPhase = false;
                this.state.peakEnergy = 0;
            }
        } else if (this.state.inSpeech && isSpeech) {
            // Still in speech, reset counters
            this.state.silenceCounter = 0;
            this.state.lastSpeechEnd = timePoint;
            this.state.endingPhase = false;
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
            continuingSpeech: false,
            peakEnergy: 0,
            endingPhase: false
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