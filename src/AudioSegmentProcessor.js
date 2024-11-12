import { SpeechSegment } from './SpeechSegment.js';

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
            lastProcessedSegmentEnd: 0,
            initialBufferProcessed: false,
            actualStartTime: 0,
            firstAudioDetected: false,
            processingStartTime: Date.now() / 1000,
            lastSegmentTime: 0,
            processedDuration: 0
        };

        this.debugStats = {
            totalFrames: 0,
            speechFrames: 0,
            segmentsCreated: 0
        };
    }

    processAudioData(audioData, currentTime) {
        if (!audioData || !audioData.length) {
            return [];
        }

        if (!this.state.processingStartTime) {
            this.state.processingStartTime = 0;
            this.state.totalProcessedSamples = 0;
            this.state.lastProcessedPosition = 0;
            this.state.activeSpeechStart = null;
            console.log('Initializing processing at time 0');
        }

        this.state.totalProcessedSamples = audioData.length;
        const totalDuration = this.state.totalProcessedSamples / this.options.sampleRate;

        const startPosition = this.state.lastProcessedPosition;
        const endPosition = audioData.length;
        
        if (startPosition >= endPosition) {
            return [];
        }

        const newAudioData = audioData.slice(startPosition, endPosition);
        
        console.log('Processing new audio data:', {
            startTime: (startPosition / this.options.sampleRate).toFixed(2),
            endTime: (endPosition / this.options.sampleRate).toFixed(2),
            totalDuration: totalDuration.toFixed(2),
            newDataDuration: (newAudioData.length / this.options.sampleRate).toFixed(2)
        });

        const segments = [];
        const windowSize = this.options.windowSize;
        let position = 0;
        let significantAudioDetected = false;

        while (position < newAudioData.length) {
            const window = newAudioData.slice(position, 
                Math.min(position + windowSize, newAudioData.length));
            if (window.length < windowSize) break;

            const energy = this.calculateEnergy(window);
            const maxAbs = Math.max(...window.map(Math.abs));
            
            if (maxAbs > 0.1) {
                significantAudioDetected = true;
            }

            const isSpeech = this.isSpeech(energy);
            const absoluteTime = (startPosition + position) / this.options.sampleRate;
            const absolutePosition = startPosition + position;

            if (significantAudioDetected) {
                if (!this.state.activeSpeechStart && isSpeech) {
                    this.state.activeSpeechStart = absolutePosition;
                    console.log('Speech started:', {
                        time: absoluteTime.toFixed(2),
                        energy: energy.toFixed(4)
                    });
                } else if (this.state.activeSpeechStart && !isSpeech) {
                    this.state.silenceCounter += windowSize;
                    if (this.state.silenceCounter >= this.options.minSilenceBetween * this.options.sampleRate) {
                        const segment = new SpeechSegment({
                            startTime: this.state.activeSpeechStart / this.options.sampleRate,
                            endTime: absoluteTime,
                            energy: this.state.currentEnergy,
                            audioData: new Float32Array(
                                audioData.slice(
                                    this.state.activeSpeechStart,
                                    absolutePosition
                                )
                            )
                        });

                        console.log('Speech segment completed:', {
                            start: segment.startTime.toFixed(2),
                            end: segment.endTime.toFixed(2),
                            duration: segment.getDuration().toFixed(2)
                        });

                        segments.push(segment);
                        this.state.activeSpeechStart = null;
                        this.state.silenceCounter = 0;
                    }
                } else if (this.state.activeSpeechStart && isSpeech) {
                    this.state.silenceCounter = 0;
                }
            }

            position += windowSize;
        }

        this.state.lastProcessedPosition = startPosition + position;
        this.state.processedDuration = totalDuration;

        return segments;
    }

    calculateEnergy(window) {
        if (!window || window.length === 0) return 0;

        let sum = 0;
        let maxAbs = 0;
        let dcSum = 0;

        for (let i = 0; i < window.length; i++) {
            const sample = window[i];
            dcSum += sample;
            maxAbs = Math.max(maxAbs, Math.abs(sample));
        }
        const dcOffset = dcSum / window.length;

        for (let i = 0; i < window.length; i++) {
            const sample = window[i] - dcOffset;
            sum += sample * sample;
        }

        const rmsEnergy = Math.sqrt(sum / window.length);
        const energy = (rmsEnergy * 0.7 + maxAbs * 0.3) * this.options.energyScale;

        if (!this.state.energyHistory) {
            this.state.energyHistory = [];
        }

        if (this.state.energyHistory.length >= 30) {
            this.state.energyHistory = this.state.energyHistory.slice(-29);
        }
        this.state.energyHistory.push(energy);

        const windowSize = Math.min(3, this.state.energyHistory.length);
        const recentEnergies = this.state.energyHistory.slice(-windowSize);
        const smoothedEnergy = recentEnergies.reduce((acc, val) => acc + val, 0) / recentEnergies.length;

        this.state.currentEnergy = energy;
        this.state.peakEnergy = Math.max(this.state.peakEnergy, maxAbs * this.options.energyScale);
        this.state.energyAverage = smoothedEnergy;

        return smoothedEnergy;
    }

    isSpeech(energy) {
        this.debugStats.totalFrames++;

        const baseThreshold = Math.max(
            this.options.energyThreshold,
            this.state.energyAverage * 0.5
        );

        const threshold = this.state.inSpeech ?
            baseThreshold * 0.5 :
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
            
            console.log('Speech start:', {
                time: timePoint.toFixed(2),
                totalDuration: this.state.processedDuration.toFixed(2),
                position: position,
                energy: this.state.currentEnergy.toFixed(4)
            });
        } else if (this.state.inSpeech && !isSpeech) {
            this.state.silenceCounter += this.options.windowSize;
            this.state.hangoverFrames += this.options.windowSize;
            
            const silenceThreshold = this.options.minSilenceBetween * this.options.sampleRate;
            const hangoverThreshold = this.options.speechHangover * this.options.sampleRate;
            
            if (this.state.silenceCounter >= silenceThreshold && 
                this.state.hangoverFrames >= hangoverThreshold) {
                
                const speechDuration = (position - this.state.speechStart) / this.options.sampleRate;
                
                if (speechDuration >= this.options.minSpeechDuration) {
                    const segmentStartTime = timePoint - speechDuration;
                    const segmentEndTime = timePoint;
                    
                    const segment = new SpeechSegment({
                        startTime: segmentStartTime,
                        endTime: segmentEndTime,
                        energy: this.state.currentEnergy,
                        audioData: new Float32Array(
                            audioData.slice(
                                this.state.speechStart,
                                position
                            )
                        )
                    });

                    console.log('Speech segment created:', {
                        start: segment.startTime.toFixed(2),
                        end: segment.endTime.toFixed(2),
                        duration: segment.getDuration().toFixed(2),
                        position: position,
                        totalDuration: this.state.processedDuration.toFixed(2),
                        avgEnergy: this.state.energyAverage.toFixed(4)
                    });

                    this.state.lastSegmentTime = segment.endTime;
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
            ...this.state,
            processingStartTime: 0,
            lastSegmentTime: 0,
            processedDuration: 0,
            firstAudioDetected: false,
            activeSpeechStart: null,
            silenceCounter: 0,
            energyHistory: [],
            currentEnergy: 0,
            energyAverage: 0,
            lastSegmentEnd: 0,
            peakEnergy: 0,
            lastProcessedPosition: 0,
            totalProcessedSamples: 0
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