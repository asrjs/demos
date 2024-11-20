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
            minSpeechDuration: 0.3,
            overlapThreshold: 0.5
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
        // Add audio data to the segment
        const startSample = Math.floor(segment.startTime * this.audioContext.sampleRate);
        const endSample = Math.ceil(segment.endTime * this.audioContext.sampleRate);
        segment.audioData = this.audioBuffer.slice(startSample, endSample);
        segment.sampleRate = this.audioContext.sampleRate;

        // Add unique ID to the segment
        segment.id = this.generateSegmentId();

        // Add the new segment (but don't transcribe yet)
        this.segments.push({...segment, isProcessed: false});
        
        // Find ALL potential overlapping segments, including previously merged ones
        const recentSegments = this.segments
            .filter(s => {
                // Include if:
                // 1. Not already part of another merged segment
                // 2. Overlaps with current time window
                // 3. Not the current segment
                return !s.isPartOfMerged && 
                       s.endTime >= (segment.startTime - this.parameters.overlapThreshold) &&
                       s.id !== segment.id;
            });
        
        // Add current segment to the group
        recentSegments.push(segment);
        
        if (recentSegments.length > 1) {
            console.log('Creating merged segment from:', {
                count: recentSegments.length,
                segments: recentSegments.map(s => ({
                    id: s.id,
                    start: s.startTime,
                    end: s.endTime
                }))
            });
            
            // Create merged segment with unique ID
            const mergedSegment = {
                startTime: Math.min(...recentSegments.map(s => s.startTime)),
                endTime: Math.max(...recentSegments.map(s => s.endTime)),
                isMerged: true,
                mergedCount: recentSegments.length,
                originalSegments: recentSegments.map(s => ({...s})),
                id: `merged_${Date.now()}`,
                audioData: this.getMergedAudioData(recentSegments),
                sampleRate: this.audioContext.sampleRate,
                isProcessed: false
            };
            
            // Mark ALL original segments as part of merged
            recentSegments.forEach(s => {
                const originalSegment = this.segments.find(seg => seg.id === s.id);
                if (originalSegment) {
                    originalSegment.isPartOfMerged = true;
                    originalSegment.mergedId = mergedSegment.id;
                }
            });
            
            // Remove any previous merged segments that contain these segments
            this.segments = this.segments.filter(s => 
                !s.isMerged || 
                !s.originalSegments.some(orig => 
                    recentSegments.some(recent => recent.id === orig.id)
                )
            );
            
            // Add new merged segment
            this.segments.push(mergedSegment);
            
            // Only send merged segment for transcription
            this.sendForTranscription(mergedSegment);

            console.log('Created merged segment:', {
                id: mergedSegment.id,
                start: mergedSegment.startTime,
                end: mergedSegment.endTime,
                count: mergedSegment.mergedCount,
                originalSegments: recentSegments.map(s => s.id)
            });
        } else {
            // Only transcribe if not part of a merged segment
            this.sendForTranscription(segment);
        }

        // Notify subscribers of updated segments
        this.notifyListeners('segmentsUpdated', this.segments);
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
        if (!this.worker || !segment.audioData || segment.isPartOfMerged) {
            console.log('Skipping transcription:', {
                hasWorker: !!this.worker,
                hasAudioData: !!segment.audioData,
                isPartOfMerged: segment.isPartOfMerged,
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