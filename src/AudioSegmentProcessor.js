export class AudioSegmentProcessor {
    constructor(options = {}) {
        this.options = {
            sampleRate: 16000,
            windowSize: 256,
            minSpeechDuration: 0.1,
            minSilenceBetween: 0.3,
            energyThreshold: 0.02,
            energyScale: 2,
            logger: console.log,
            ...options
        };

        this.state = {
            inSpeech: false,
            speechStart: null,
            silenceCounter: 0,
            energyHistory: [],
            currentEnergy: 0,
            energyAverage: 0
        };

        this.debugStats = {
            totalFrames: 0,
            speechFrames: 0,
            segmentsCreated: 0
        };
    }

    processAudioData(audioData, currentTime) {
        const segments = [];
        
        // Process audio in windows
        for (let i = 0; i < audioData.length; i += this.options.windowSize) {
            const window = audioData.slice(i, i + this.options.windowSize);
            const energy = this.calculateEnergy(window);
            const isSpeech = this.isSpeech(energy);
            
            this.handleStateTransition(isSpeech, i, currentTime + i/this.options.sampleRate, audioData, segments);
        }

        return segments;
    }

    calculateEnergy(window) {
        if (window.length === 0) return 0;
        
        const energy = Math.sqrt(
            window.reduce((sum, sample) => sum + sample * sample, 0) / window.length
        ) * this.options.energyScale;
        
        // Update background energy with longer history
        if (this.energyHistory.length > 50) {
            this.energyHistory.shift();
        }
        this.energyHistory.push(energy);
        
        // Use median for more stable background estimation
        const sortedEnergies = [...this.energyHistory].sort((a, b) => a - b);
        this.energyAverage = sortedEnergies[Math.floor(sortedEnergies.length / 2)];

        this.log('Energy calculation', {
            energy: energy.toFixed(5),
            average: this.energyAverage.toFixed(5),
            historyLength: this.energyHistory.length
        });
        
        return energy;
    }

    isSpeech(energy) {
        this.debugStats.totalFrames++;
        const dynamicThreshold = Math.max(
            this.options.energyThreshold,
            this.energyAverage * 1.1
        );
        
        this.log('Speech detection', {
            energy: energy.toFixed(5),
            threshold: this.options.energyThreshold.toFixed(5),
            dynamicThreshold: dynamicThreshold.toFixed(5),
            background: this.energyAverage.toFixed(5),
            isSpeech: energy > dynamicThreshold
        });
        
        const isSpeech = energy > dynamicThreshold;
        if (isSpeech) this.debugStats.speechFrames++;
        
        return isSpeech;
    }

    log(message, data = null) {
        if (data) {
            this.options.logger(`${message}: ${JSON.stringify(data)}`);
        } else {
            this.options.logger(message);
        }
    }

    reset() {
        this.state.inSpeech = false;
        this.state.speechStart = null;
        this.state.silenceCounter = 0;
        this.state.energyHistory = [];
    }

    setThreshold(threshold) {
        this.options.energyThreshold = threshold;
    }

    setSilenceLength(length) {
        this.options.minSilenceBetween = length;
        this.log('Updated silence length', length);
    }

    handleStateTransition(isSpeech, position, timePoint, audioData, segments) {
        if (!this.state.inSpeech && isSpeech) {
            // Transition: Silence -> Speech
            this.state.inSpeech = true;
            this.state.speechStart = position;
            this.log('🎤 Speech start detected', {
                time: timePoint.toFixed(2),
                energy: this.state.currentEnergy.toFixed(5)
            });

        } else if (this.state.inSpeech && !isSpeech) {
            // In speech but detected silence
            this.state.silenceCounter += this.options.windowSize;
            
            // Check if silence is long enough to end speech
            if (this.state.silenceCounter > this.options.minSilenceBetween * this.options.sampleRate) {
                // Create speech segment
                const speechDuration = (position - this.state.speechStart) / this.options.sampleRate;
                
                if (speechDuration >= this.options.minSpeechDuration) {
                    const segment = {
                        startTime: timePoint - speechDuration,
                        endTime: timePoint,
                        audioData: new Float32Array(
                            audioData.slice(
                                this.state.speechStart,
                                position + this.options.windowSize
                            )
                        )
                    };

                    this.log('📢 Speech segment created', {
                        start: segment.startTime.toFixed(2),
                        end: segment.endTime.toFixed(2),
                        duration: speechDuration.toFixed(2)
                    });

                    segments.push(segment);
                }

                // Reset state
                this.state.inSpeech = false;
                this.state.speechStart = null;
                this.state.silenceCounter = 0;
            }
        } else if (this.state.inSpeech && isSpeech) {
            // Still in speech, reset silence counter
            this.state.silenceCounter = 0;
        }
    }
} 