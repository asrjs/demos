import {
    AutoTokenizer,
    AutoProcessor,
    WhisperForConditionalGeneration,
    TextStreamer,
    full,
    env
} from '@huggingface/transformers';

// Configure environment for local models
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models';

const MAX_NEW_TOKENS = 96;
const MAX_PARALLEL_JOBS = 1;

class AutomaticSpeechRecognitionPipeline {
    static model_id = 'small-dsntt1-tr';
    static tokenizer = null;
    static processor = null;
    static model = null;
    static isInitialized = false;

    static async getInstance(progress_callback = null) {
        if (this.isInitialized) {
            return [this.tokenizer, this.processor, this.model];
        }

        try {
            // Load tokenizer
            this.tokenizer = await AutoTokenizer.from_pretrained(this.model_id, {
                progress_callback: (progress) => {
                    progress_callback?.({
                        status: 'initiate',
                        file: 'tokenizer',
                        ...progress
                    });
                },
                local: true,
            });
            
            // Load processor
            this.processor = await AutoProcessor.from_pretrained(this.model_id, {
                progress_callback: (progress) => {
                    progress_callback?.({
                        status: 'initiate',
                        file: 'processor',
                        ...progress
                    });
                },
                local: true,
            });

            // Load model
            this.model = await WhisperForConditionalGeneration.from_pretrained(this.model_id, {
                local: true,
                device: 'webgpu',
                progress_callback: (progress) => {
                    progress_callback?.({
                        status: 'initiate',
                        file: 'model',
                        ...progress
                    });
                },
            });

            this.isInitialized = true;
            return [this.tokenizer, this.processor, this.model];
        } catch (error) {
            console.error('Pipeline initialization error:', error);
            throw error;
        }
    }
}

let isLoaded = false;
let pipeline = null;
let transcriptionQueue = new Map();
let isProcessing = false;

async function transcribeAudio(audioData, options) {
    try {
        const [tokenizer, processor, model] = await pipeline;
        
        // Create new session for each transcription
        const inputs = await processor(audioData);
        const outputs = await model.generate({
            ...inputs,
            max_new_tokens: MAX_NEW_TOKENS,
            language: options.language,
            top_k: 10,
        });

        return tokenizer.batch_decode(outputs, { skip_special_tokens: true })[0];
    } catch (error) {
        console.error('Transcription error:', error);
        throw error;
    }
}

async function processQueue() {
    if (isProcessing || transcriptionQueue.size === 0) return;
    
    isProcessing = true;
    
    try {
        // Process one task at a time
        const [firstTaskId] = transcriptionQueue.keys();
        const task = transcriptionQueue.get(firstTaskId);
        
        console.log('Processing task:', task.data.segmentId);

        try {
            const output = await transcribeAudio(task.data.audioData, {
                language: task.data.language
            });

            self.postMessage({
                status: 'complete',
                segmentId: task.data.segmentId,
                output,
                isMerged: task.data.isMerged
            });
        } catch (error) {
            console.error('Error transcribing segment:', task.data.segmentId, error);
            self.postMessage({
                status: 'error',
                segmentId: task.data.segmentId,
                error: error.message
            });
        }

        // Remove processed task from queue
        transcriptionQueue.delete(firstTaskId);

    } catch (error) {
        console.error('Queue processing error:', error);
    } finally {
        isProcessing = false;
        
        // If there are more items in queue, process them
        if (transcriptionQueue.size > 0) {
            setTimeout(processQueue, 100); // Add small delay between processing
        }
    }
}

async function load() {
    if (isLoaded) {
        console.log('Model already loaded');
        self.postMessage({ status: 'ready' });
        return;
    }

    console.log('Loading Whisper model...');
    
    self.postMessage({
        status: 'loading',
        data: 'Loading Whisper model...'
    });

    try {
        pipeline = AutomaticSpeechRecognitionPipeline.getInstance(progress => {
            self.postMessage(progress);
        });

        await pipeline; // Wait for initialization

        // Model warm-up
        console.log('Warming up model...');
        self.postMessage({
            status: 'loading',
            data: 'Compiling shaders and warming up model...'
        });

        const [,,model] = await pipeline;
        await model.generate({
            input_features: full([1, 80, 3000], 0.0),
            max_new_tokens: 1,
        });
        
        isLoaded = true;
        console.log('Model ready');
        self.postMessage({ status: 'ready' });
    } catch (error) {
        console.error('Error loading model:', error);
        throw error;
    }
}

self.addEventListener('message', async (e) => {
    const { type, data } = e.data;

    switch (type) {
        case 'load':
            await load();
            break;

        case 'transcribe':
            // Add to queue if not already present
            if (!transcriptionQueue.has(data.segmentId)) {
                transcriptionQueue.set(data.segmentId, { type, data });
                console.log('Added to queue:', data.segmentId, 
                    'Queue size:', transcriptionQueue.size);
                
                // Try to process queue
                processQueue();
            } else {
                console.log('Segment already in queue:', data.segmentId);
            }
            break;
    }
});
