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

        const samplesFor30Sec = 30 * this.options.sampleRate;
        
        if (!this.state.processingStartTime) {
            this.state.processingStartTime = 0;
            this.state.totalProcessedSamples = 0;
            console.log('Initializing processing at time 0');
        }

        this.state.totalProcessedSamples = audioData.length;
        const totalDuration = this.state.totalProcessedSamples / this.options.sampleRate;

        const startSample = Math.max(0, audioData.length - samplesFor30Sec);
        const processStartTime = startSample / this.options.sampleRate;

        let processableData = audioData;
        if (audioData.length > samplesFor30Sec) {
            processableData = audioData.slice(-samplesFor30Sec);
        }

        if (!this.state.firstAudioDetected) {
            this.state.firstAudioDetected = true;
            this.state.actualStartTime = 0;
        }

        const segments = [];
        const windowSize = this.options.windowSize;
        let position = 0;

        while (position < processableData.length) {
            const window = processableData.slice(position, 
                Math.min(position + windowSize, processableData.length));
            if (window.length < windowSize) break;

            const energy = this.calculateEnergy(window);
            const isSpeech = this.isSpeech(energy);
            
            const absoluteTime = processStartTime + (position / this.options.sampleRate);

            const absolutePosition = startSample + position;
            this.handleStateTransition(isSpeech, absolutePosition, absoluteTime, audioData, segments);
            
            position += windowSize;
        }

        this.state.lastProcessedSampleIndex = startSample + position;
        this.state.processedDuration = totalDuration;

        console.log('Processing audio buffer:', {
            totalDuration: totalDuration.toFixed(2),
            processStartTime: processStartTime.toFixed(2),
            bufferLength: (processableData.length / this.options.sampleRate).toFixed(2)
        });

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
                bufferTime: timePoint.toFixed(2),
                totalDuration: this.state.processedDuration.toFixed(2),
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
            processingStartTime: Date.now() / 1000,
            lastSegmentTime: 0,
            processedDuration: 0,
            firstAudioDetected: false,
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

    setThreshold(threshold) {
        this.options.energyThreshold = threshold;
    }

    setSilenceLength(length) {
        this.options.minSilenceBetween = length;
    }
} 