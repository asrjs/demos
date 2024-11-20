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

            // Load model with specific configuration
            this.model = await WhisperForConditionalGeneration.from_pretrained(this.model_id, {
                local: true,
                device: 'webgpu',
                dtype: 'fp32', // Explicitly set dtype
                revision: 'main',
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
        
        // Process audio data
        const inputs = await processor(audioData);
        
        // Generate with explicit configuration
        const outputs = await model.generate({
            ...inputs,
            max_new_tokens: MAX_NEW_TOKENS,
            language: options.language,
            top_k: 10,
            do_sample: false, // Disable sampling for deterministic output
            num_beams: 1,     // Simple beam search
            return_dict_in_generate: false
        });

        return tokenizer.batch_decode(outputs, { 
            skip_special_tokens: true,
            clean_up_tokenization_spaces: true 
        })[0];
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
            setTimeout(processQueue, 100);
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
        pipeline = await AutomaticSpeechRecognitionPipeline.getInstance(progress => {
            self.postMessage(progress);
        });

        // Model warm-up with explicit configuration
        console.log('Warming up model...');
        self.postMessage({
            status: 'loading',
            data: 'Compiling shaders and warming up model...'
        });

        const [,,model] = pipeline;
        await model.generate({
            input_features: full([1, 80, 3000], 0.0),
            max_new_tokens: 1,
            do_sample: false,
            num_beams: 1
        });
        
        isLoaded = true;
        console.log('Model ready');
        self.postMessage({ status: 'ready' });
    } catch (error) {
        console.error('Error loading model:', error);
        self.postMessage({ 
            status: 'error', 
            error: error.message 
        });
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
            if (!transcriptionQueue.has(data.segmentId)) {
                transcriptionQueue.set(data.segmentId, { type, data });
                console.log('Added to queue:', data.segmentId, 
                    'Queue size:', transcriptionQueue.size);
                
                processQueue();
            } else {
                console.log('Segment already in queue:', data.segmentId);
            }
            break;
    }
});
