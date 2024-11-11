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
            lastProcessedTime: 0,
            lastProcessedPosition: 0,
            silenceOffset: 30,
            totalProcessedSamples: 0,
            lastProcessedSampleIndex: 0,
            lastProcessedSegmentEnd: 0
        };

        this.debugStats = {
            totalFrames: 0,
            speechFrames: 0,
            segmentsCreated: 0
        };
    }

    processAudioData(audioData, currentTime) {
        const samplesFor30Sec = 30 * this.options.sampleRate;
        
        // Only process the most recent 30 seconds
        if (audioData.length > samplesFor30Sec) {
            audioData = audioData.slice(-samplesFor30Sec);
            this.state.lastProcessedSampleIndex = 0;
        }

        const segments = [];
        const windowSize = this.options.windowSize;

        for (let i = this.state.lastProcessedSampleIndex; i < audioData.length; i += windowSize) {
            const window = audioData.slice(i, Math.min(i + windowSize, audioData.length));
            if (window.length < windowSize) break;

            const energy = this.calculateEnergy(window);
            const isSpeech = this.isSpeech(energy);
            const timePoint = (i / this.options.sampleRate);

            if (isSpeech && energy > this.options.energyThreshold * 3 && 
                timePoint > this.state.lastProcessedSegmentEnd) {
                console.log('New speech activity:', {
                    timePoint: timePoint.toFixed(2),
                    energy: energy.toFixed(6)
                });
            }

            if (timePoint > this.state.lastSegmentEnd) {
                this.handleStateTransition(isSpeech, i, timePoint, audioData, segments);
            }
        }

        this.state.lastProcessedSampleIndex = audioData.length;
        
        if (segments.length > 0) {
            const lastSegment = segments[segments.length - 1];
            this.state.lastProcessedSegmentEnd = lastSegment.endTime;
        }

        return segments;
    }

    calculateEnergy(window) {
        if (!window || window.length === 0) return 0;

        let sum = 0;
        let maxAbs = 0;
        let dcSum = 0;

        for (let i = 0; i < window.length; i++) {
            dcSum += window[i];
            maxAbs = Math.max(maxAbs, Math.abs(window[i]));
        }

        const dcOffset = dcSum / window.length;

        for (let i = 0; i < window.length; i++) {
            const normalizedSample = window[i] - dcOffset;
            sum += normalizedSample * normalizedSample;
        }

        const energy = Math.sqrt(sum / window.length) * this.options.energyScale;

        if (!this.energyHistory) {
            this.energyHistory = [];
        }

        if (this.energyHistory.length > 50) {
            this.energyHistory.shift();
        }
        this.energyHistory.push(energy);

        const start = Math.max(0, this.energyHistory.length - this.options.movingAverageWindow);
        let sum2 = 0;
        for (let i = start; i < this.energyHistory.length; i++) {
            sum2 += this.energyHistory[i];
        }
        const smoothedEnergy = sum2 / (this.energyHistory.length - start);

        this.state.currentEnergy = energy;
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

    handleStateTransition(isSpeech, position, timePoint, audioData, segments) {
        if (!this.state.inSpeech && isSpeech) {
            this.state.inSpeech = true;
            this.state.speechStart = position;
            this.state.silenceCounter = 0;
            this.state.hangoverFrames = 0;
            
            console.log('Speech start detected:', {
                timePoint: timePoint.toFixed(2),
                energy: this.state.currentEnergy.toFixed(6),
                threshold: this.options.energyThreshold
            });
        } else if (this.state.inSpeech && !isSpeech) {
            this.state.silenceCounter += this.options.windowSize;
            
            if (this.state.silenceCounter >= (this.options.minSilenceBetween * this.options.sampleRate)) {
                const speechDuration = (position - this.state.speechStart) / this.options.sampleRate;
                
                if (speechDuration >= this.options.minSpeechDuration) {
                    const segmentStartTime = timePoint - speechDuration;
                    const segmentEndTime = timePoint + (this.options.speechHangover / 2);
                    
                    const segment = {
                        startTime: Math.max(0, Math.min(30, segmentStartTime)),
                        endTime: Math.max(0, Math.min(30, segmentEndTime)),
                        energy: this.state.currentEnergy,
                        audioData: audioData.slice(
                            this.state.speechStart,
                            position + this.options.windowSize
                        )
                    };

                    console.log('Creating segment:', {
                        start: segment.startTime.toFixed(2),
                        end: segment.endTime.toFixed(2),
                        duration: speechDuration.toFixed(2),
                        timePoint: timePoint.toFixed(2)
                    });

                    this.state.lastSegmentEnd = segment.endTime + 0.1;
                    segments.push(segment);
                    this.debugStats.segmentsCreated++;
                }

                this.state.inSpeech = false;
                this.state.speechStart = null;
                this.state.silenceCounter = 0;
                this.state.hangoverFrames = 0;
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
            lastProcessedTime: 0,
            lastProcessedPosition: 0,
            silenceOffset: 30,
            totalProcessedSamples: 0,
            lastProcessedSampleIndex: 0,
            lastProcessedSegmentEnd: 0
        };
        
        this.debugStats = {
            totalFrames: 0,
            speechFrames: 0,
            segmentsCreated: 0
        };
    }

    setThreshold(threshold) {
        this.options.energyThreshold = threshold;
    }

    setSilenceLength(length) {
        this.options.minSilenceBetween = length;
    }
} 