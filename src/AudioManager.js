import { AudioSegmentProcessor } from './AudioSegmentProcessor';
import { SpeechSegment } from './SpeechSegment';

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
        console.log('AudioManager: Handling new segment', {
            segment,
            currentSegments: this.segments.length
        });
        
        // Add audio data and basic properties
        const startSample = Math.floor(segment.startTime * this.audioContext.sampleRate);
        const endSample = Math.ceil(segment.endTime * this.audioContext.sampleRate);
        
        // Create a proper segment object if it's not already one
        const segmentObj = segment instanceof SpeechSegment ? segment : new SpeechSegment({
            startTime: segment.startTime,
            endTime: segment.endTime,
            audioData: this.audioBuffer.slice(startSample, endSample),
            sampleRate: this.audioContext.sampleRate,
            energy: segment.energy || 0,
            isProcessed: false,
            isMerged: false,
            isPartOfMerged: false
        });

        // Add unique ID
        segmentObj.id = this.generateSegmentId();
        
        // Add to segments array
        this.segments.push(segmentObj);
        
        // Always transcribe the individual segment first
        this.sendForTranscription(segmentObj);

        // Find potential overlapping segments for merging
        const recentSegments = this.segments
            .filter(s => {
                return !s.isPartOfMerged && 
                       !s.isMerged && 
                       s.id !== segmentObj.id;
            })
            .filter(s => {
                return s.endTime >= segmentObj.startTime && 
                       s.startTime <= segmentObj.endTime;
            })
            .sort((a, b) => b.endTime - a.endTime);

        if (recentSegments.length > 0) {
            // Include current segment in merge
            const allSegments = [...recentSegments, segmentObj];
            
            // Create merged segment
            const mergedSegment = new SpeechSegment({
                startTime: Math.min(...allSegments.map(s => s.startTime)),
                endTime: Math.max(...allSegments.map(s => s.endTime)),
                audioData: this.getMergedAudioData(allSegments),
                sampleRate: this.audioContext.sampleRate,
                energy: Math.max(...allSegments.map(s => s.energy)),
                isProcessed: false,
                isMerged: true,
                isPartOfMerged: false
            });

            mergedSegment.id = `merged_${Date.now()}`;
            mergedSegment.mergedCount = allSegments.length;
            mergedSegment.originalSegments = allSegments;

            // Mark original segments as part of merged but don't set isProcessed
            // so they still get transcribed individually
            allSegments.forEach(s => {
                const originalSegment = this.segments.find(seg => seg.id === s.id);
                if (originalSegment) {
                    originalSegment.isPartOfMerged = true;
                    originalSegment.mergedId = mergedSegment.id;
                }
            });

            // Add merged segment
            this.segments.push(mergedSegment);
            
            // Also transcribe the merged segment
            this.sendForTranscription(mergedSegment);
            
            console.log('Created merged segment:', {
                id: mergedSegment.id,
                start: mergedSegment.startTime.toFixed(2),
                end: mergedSegment.endTime.toFixed(2),
                count: mergedSegment.mergedCount,
                originalSegments: allSegments.map(s => s.id)
            });
        }

        console.log('AudioManager: Updated segments', {
            totalSegments: this.segments.length,
            lastSegment: this.segments[this.segments.length - 1]
        });
        
        this.notifyListeners('segmentsUpdated', [...this.segments]);
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
        if (!this.worker || !segment.audioData) {
            console.log('Cannot transcribe:', {
                hasWorker: !!this.worker,
                hasAudioData: !!segment.audioData,
                segment
            });
            return;
        }
        
        const transcriptionId = segment.id;

        // Skip if already transcribing
        if (this._activeTranscriptions.has(transcriptionId)) {
            console.log('Already transcribing:', transcriptionId);
            return;
        }

        console.log('Sending for transcription:', {
            id: transcriptionId,
            isMerged: segment.isMerged,
            duration: segment.endTime - segment.startTime
        });

        // Mark as being processed
        segment.isProcessed = true;
        this._activeTranscriptions.add(transcriptionId);

        // Send to worker
        this.worker.postMessage({
            type: 'transcribe',
            data: {
                audioData: segment.audioData,
                language: this.language,
                segmentId: transcriptionId,
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
        this.notifyListeners('segmentsUpdated', [...this.segments]);
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
        Object.assign(this.parameters, params);
        if (this.processor) {
            this.processor.setThreshold(this.parameters.threshold);
            this.processor.setSilenceLength(this.parameters.silenceLength);
        }
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