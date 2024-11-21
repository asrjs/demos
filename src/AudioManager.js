import { AudioSegmentProcessor } from './AudioSegmentProcessor';

/**
 * Singleton class to manage audio state and processing across components
 * @class AudioManager
 */
export class AudioManager {
    static instance = null;
    
    constructor() {
        if (AudioManager.instance) {
            return AudioManager.instance;
        }
        
        this.audioContext = null;
        this.processor = null;
        this.listeners = new Set();
        this.initialized = false;
        
        this.parameters = {
            threshold: 0.02,
            silenceLength: 0.8,
            minSpeechDuration: 0.3
        };
        
        // Chunk işleme için state
        this.segments = [];
        this.recordedChunks = [];
        
        // Tüm ses verisini tutmak için
        this.audioBuffer = new Float32Array(0);
        this.lastProcessedTime = 0;
        
        this._activeTranscriptions = new Set();
        this.worker = null;
        this.language = 'tr';
        
        this._nextSegmentId = 0;
        
        AudioManager.instance = this;
    }

    /**
     * Initialize audio context and processor
     * @param {Object} options - Configuration options
     * @param {number} options.sampleRate - Sample rate for audio processing
     * @param {Function} options.onSegmentDetected - Callback for new segments
     */
    async initialize(options = {}) {
        if (this.initialized) return;

        try {
            this.options = options;
            this.processor = new AudioSegmentProcessor({
                sampleRate: options.sampleRate || 16000,
                onSegmentDetected: this.handleNewSegment.bind(this)
            });
            
            this.initialized = true;
            this.notifyListeners('initialized');
        } catch (error) {
            console.error('Failed to initialize AudioManager:', error);
            throw error;
        }
    }

    /**
     * Start audio context (must be called after user gesture)
     */
    async startAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new AudioContext({ 
                sampleRate: this.options?.sampleRate || 16000 
            });
        }
        
        if (this.audioContext.state !== 'running') {
            await this.audioContext.resume();
        }
        
        this.notifyListeners('audioContextStarted');
    }

    /**
     * Process new chunk of audio data
     * @param {Float32Array} chunk - New audio chunk
     */
    processNewChunk(chunk, energy) {
        if (!chunk || !chunk.length) return;

        // Add to main buffer
        const newBuffer = new Float32Array(this.audioBuffer.length + chunk.length);
        newBuffer.set(this.audioBuffer);
        newBuffer.set(chunk, this.audioBuffer.length);
        this.audioBuffer = newBuffer;

        const currentTime = this.getCurrentTime();
        
        // Process chunk and get segments
        const newSegments = this.processor.processAudioData(
            chunk,
            currentTime,
            energy,
            this.audioBuffer,
            this.lastProcessedTime
        );
        
        // Handle any new segments
        if (newSegments.length > 0) {
            newSegments.forEach(segment => this.handleNewSegment(segment));
        }

        this.lastProcessedTime = currentTime;
    }

    /**
     * Get current time
     * @returns {number} Current time in seconds
     */
    getCurrentTime() {
        return this.audioContext ? this.audioContext.currentTime : 0;
    }

    /**
     * Subscribe to audio state changes
     * @param {Function} callback - Listener callback
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Notify all listeners of state change
     * @param {string} event - Event type
     * @param {*} data - Event data
     */
    notifyListeners(event, data) {
        this.listeners.forEach(listener => listener(event, data));
    }

    /**
     * Handle new segment detection
     * @param {Object} segment - Detected speech segment
     */
    handleNewSegment(segment) {
        // Calculate energy integral for the segment
        const energyIntegral = this.calculateSegmentEnergyIntegral(segment);
        const duration = segment.endTime - segment.startTime;
        
        // Log all candidate segments with their properties
        console.log('Candidate segment detected:', {
            startTime: segment.startTime.toFixed(2),
            endTime: segment.endTime.toFixed(2),
            duration: duration.toFixed(2),
            energyIntegral: energyIntegral.toFixed(4),
            isValidSpeech: duration >= this.parameters.minSpeechDuration && 
                          energyIntegral >= this.parameters.minEnergyIntegral,
            minDurationRequired: this.parameters.minSpeechDuration,
            minEnergyIntegralRequired: this.parameters.minEnergyIntegral
        });

        // Filter out short noises and clicks
        const isValidSpeech = 
            duration >= this.parameters.minSpeechDuration && 
            energyIntegral >= this.parameters.minEnergyIntegral;

        if (!isValidSpeech) {
            console.log('🚫 Filtered out noise segment:', {
                reason: duration < this.parameters.minSpeechDuration ? 
                    'Too short' : 'Energy integral too low',
                duration: duration.toFixed(2),
                energyIntegral: energyIntegral.toFixed(4),
                thresholds: {
                    minDuration: this.parameters.minSpeechDuration,
                    minEnergyIntegral: this.parameters.minEnergyIntegral
                }
            });
            return;
        }

        console.log('✅ Valid speech segment:', {
            duration: duration.toFixed(2),
            energyIntegral: energyIntegral.toFixed(4)
        });

        // Add audio data and metadata to the segment
        const startSample = Math.floor(segment.startTime * this.audioContext.sampleRate);
        const endSample = Math.ceil(segment.endTime * this.audioContext.sampleRate);
        segment.audioData = this.audioBuffer.slice(startSample, endSample);
        segment.sampleRate = this.audioContext.sampleRate;
        segment.energyIntegral = energyIntegral;

        // Add metadata
        segment.id = this.generateSegmentId();
        segment.isProcessed = false;
        segment.isMerged = false;
        segment.isPartOfMerged = false;
        segment.mergedId = null;

        // Add to segments array
        this.segments.push(segment);
        
        // Find overlapping segments
        const recentSegments = this.segments
            .filter(s => !s.isPartOfMerged && 
                        s.endTime >= (segment.startTime - 0.5) &&
                        s.id !== segment.id);
        
        if (recentSegments.length > 0) {
            // Create merged segment
            const mergedSegment = {
                startTime: Math.min(...recentSegments.map(s => s.startTime), segment.startTime),
                endTime: Math.max(...recentSegments.map(s => s.endTime), segment.endTime),
                id: `merged_${Date.now()}`,
                isMerged: true,
                isProcessed: false,
                audioData: this.getMergedAudioData([...recentSegments, segment]),
                sampleRate: this.audioContext.sampleRate,
                originalSegments: [...recentSegments, segment]
            };

            // Mark original segments
            [...recentSegments, segment].forEach(s => {
                s.isPartOfMerged = true;
                s.mergedId = mergedSegment.id;
            });

            this.segments.push(mergedSegment);
            this.sendForTranscription(mergedSegment);
        } else {
            this.sendForTranscription(segment);
        }

        this.notifyListeners('segmentsUpdated', this.segments);
    }

    calculateSegmentEnergyIntegral(segment) {
        const startSample = Math.floor(segment.startTime * this.audioContext.sampleRate);
        const endSample = Math.ceil(segment.endTime * this.audioContext.sampleRate);
        const segmentData = this.audioBuffer.slice(startSample, endSample);
        
        // Calculate energy integral (sum of squared amplitudes)
        let energyIntegral = 0;
        for (let i = 0; i < segmentData.length; i++) {
            energyIntegral += segmentData[i] * segmentData[i];
        }
        
        // Normalize by duration
        const duration = (endSample - startSample) / this.audioContext.sampleRate;
        return energyIntegral / duration;
    }

    getMergedAudioData(segments) {
        if (!segments.length) return new Float32Array(0);
        
        const startTime = Math.min(...segments.map(s => s.startTime));
        const endTime = Math.max(...segments.map(s => s.endTime));
        
        const startSample = Math.floor(startTime * this.audioContext.sampleRate);
        const endSample = Math.ceil(endTime * this.audioContext.sampleRate);
        
        return this.audioBuffer.slice(startSample, endSample);
    }

    sendForTranscription(segment) {
        if (!this.worker || !segment.audioData || 
            (segment.isPartOfMerged && !segment.isMerged)) return;
        
        if (this._activeTranscriptions.has(segment.id)) return;
        
        segment.isProcessed = true;
        this._activeTranscriptions.add(segment.id);

        this.worker.postMessage({
            type: 'transcribe',
            data: {
                audioData: segment.audioData,
                language: this.language,
                segmentId: segment.id,
                isMerged: segment.isMerged
            }
        });
    }

    handleTranscriptionResult(result) {
        const { segmentId, output, isMerged } = result;
        this._activeTranscriptions.delete(segmentId);

        console.log('Received transcription result:', {
            segmentId,
            output,
            isMerged
        });

        // Update segments with transcription
        this.segments = this.segments.map(segment => {
            if (segment.id === segmentId) {
                // If this is a merged segment, update original segments too
                if (segment.isMerged) {
                    segment.originalSegments.forEach(origSeg => {
                        const originalSegment = this.segments.find(s => s.id === origSeg.id);
                        if (originalSegment) {
                            originalSegment.transcription = `(Part of: ${output})`;
                            originalSegment.isProcessed = true;
                        }
                    });
                }
                return { 
                    ...segment, 
                    transcription: output,
                    isProcessed: true 
                };
            }
            return segment;
        });

        // Notify subscribers of updated segments
        this.notifyListeners('segmentsUpdated', this.segments);
    }

    /**
     * Reset all state
     */
    reset() {
        this.segments = [];
        this.recordedChunks = [];
        if (this.processor) {
            this.processor.reset();
        }
        this.notifyListeners('reset');
    }

    /**
     * Update all parameters at once
     * @param {Object} params - Object containing parameter updates
     */
    updateParameters(params) {
        // Update internal parameters
        Object.assign(this.parameters, params);
        
        // Update processor parameters if processor exists
        if (this.processor) {
            // Only call methods that exist on the processor
            if (params.threshold !== undefined) {
                this.processor.setThreshold?.(this.parameters.threshold);
            }
            if (params.silenceLength !== undefined) {
                this.processor.setSilenceLength?.(this.parameters.silenceLength);
            }
            
            // Update processor options directly for other parameters
            if (this.processor.options) {
                Object.assign(this.processor.options, {
                    minSpeechDuration: this.parameters.minSpeechDuration,
                    energyScale: this.parameters.energyScale,
                    hysteresisRatio: this.parameters.hysteresisRatio,
                    minEnergyIntegral: this.parameters.minEnergyIntegral
                });
            }
        }
        
        // Log parameter updates for debugging
        console.log('Updated parameters:', this.parameters);
    }

    mergeOverlappingSegments(segments) {
        if (!segments || segments.length < 2) return segments;

        const merged = [];
        let currentMerged = segments[0];

        for (let i = 1; i < segments.length; i++) {
            const current = segments[i];
            
            // Check for overlap
            if (current.startTime <= currentMerged.endTime) {
                // Merge by extending the end time
                currentMerged = {
                    ...currentMerged,
                    endTime: Math.max(currentMerged.endTime, current.endTime),
                    isProcessed: false, // Reset processed flag for merged segment
                    isMerged: true, // Mark as merged segment
                    mergedCount: (currentMerged.mergedCount || 1) + 1
                };
            } else {
                merged.push(currentMerged);
                currentMerged = current;
            }
        }
        merged.push(currentMerged);
        return merged;
    }

    setWorker(worker) {
        this.worker = worker;
    }

    // Add method to generate unique segment IDs
    generateSegmentId() {
        return `segment_${this._nextSegmentId++}`;
    }
}

// Export singleton instance
export const audioManager = new AudioManager(); 