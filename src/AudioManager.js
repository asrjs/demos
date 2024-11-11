import { SpeechSegment } from './SpeechSegment';

export class AudioManager {
    constructor(worker, options = {}) {
        this.worker = worker;
        this.options = {
            sampleRate: options.sampleRate || 16000,
            logger: options.logger || console.log,
            audioProcessor: options.audioProcessor
        };

        this.segments = [];
        this.callbacks = {};
        this.log('AudioManager initialized');
    }

    setCallbacks(callbacks) {
        this.callbacks = callbacks;
    }

    setThreshold(threshold) {
        if (this.options.audioProcessor) {
            this.options.audioProcessor.options.energyThreshold = threshold;
        }
    }

    setSilenceLength(length) {
        if (this.options.audioProcessor) {
            this.options.audioProcessor.options.minSilenceBetween = length;
        }
    }

    async processAudioBuffer(audioBuffer) {
        try {
            const audioData = audioBuffer.getChannelData(0);
            const maxValue = Math.max(...Array.from(audioData.slice(0, 1000)).map(Math.abs));
            
            if (maxValue > 0.1) {
                console.log('Processing audio with level:', maxValue.toFixed(3));
            }

            if (!this.options.audioProcessor) {
                console.error('No audio processor available');
                return;
            }

            const newSegments = this.options.audioProcessor.processAudioData(
                audioData,
                this.segments.length > 0 
                    ? this.segments[this.segments.length - 1].endTime 
                    : 0
            );

            if (newSegments.length > 0) {
                console.log('Found speech segments:', {
                    count: newSegments.length,
                    segments: newSegments.map(s => ({
                        start: s.startTime.toFixed(2),
                        end: s.endTime.toFixed(2)
                    }))
                });

                const speechSegments = newSegments.map(seg => new SpeechSegment({
                    startTime: seg.startTime,
                    endTime: seg.endTime,
                    energy: seg.energy,
                    audioData: audioData.slice(
                        Math.floor(seg.startTime * this.options.sampleRate),
                        Math.floor(seg.endTime * this.options.sampleRate)
                    )
                }));

                this.segments.push(...speechSegments);
                this.callbacks.onSegmentsUpdate?.(this.segments);
            }

        } catch (error) {
            console.error('Error in AudioManager:', error);
        }
    }

    reset() {
        this.segments = [];
        this.callbacks.onSegmentsUpdate?.(this.segments);
    }

    log(message, data = null) {
        if (this.options.logger) {
            this.options.logger(message, data);
        }
    }
} 