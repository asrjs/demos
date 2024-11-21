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
    static model_id = 'base-dsntt1-tr';
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
                dtype: 'fp32',   // Change to int8 for quantization
                quantized: false, // Enable quantization
                // revision: 'main',
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
            // chunk_length_s: 45,
            // stride_length_s: 4,

            // Beam search optimization
            num_beams: 1,              // Increase beam search width for better candidates
            // length_penalty: 1.0,       // Encourage longer sequences
            // no_repeat_ngram_size: 3,   // Prevent repetition of 3-grams
            
            // Sampling strategy
            // do_sample: true,           // Enable sampling for more natural output
            // top_k: 25,                 // Consider more candidates
            // top_p: 0.9,              // Nucleus sampling threshold
            temperature: 0.0,          // Add some randomness while keeping coherence
            
            // Additional options
            // early_stopping: true,      // Stop when no better candidates are found  * worse
            // bad_words_ids: [[1]],     // Optionally block specific tokens
            return_dict_in_generate: false, // Get detailed output info
            output_scores: false        // Get token probabilities
        });

        return tokenizer.batch_decode(outputs, { 
            skip_special_tokens: true,
            // clean_up_tokenization_spaces: true
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
