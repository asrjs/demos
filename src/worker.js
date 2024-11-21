import {
    AutoTokenizer,
    AutoProcessor,
    WhisperForConditionalGeneration,
    TextStreamer,
    full,
    env
} from '@huggingface/transformers';

// Configure environment for local models
env.allowLocalModels = false;
env.allowRemoteModels = true;

const MAX_NEW_TOKENS = 96;
const MAX_PARALLEL_JOBS = 1;

class AutomaticSpeechRecognitionPipeline {
    static model_id = null;
    static tokenizer = null;
    static processor = null;
    static model = null;
    static isInitialized = false;

    static async getInstance(modelId, progress_callback = null) {
        if (this.isInitialized && this.model_id === modelId) {
            return [this.tokenizer, this.processor, this.model];
        }

        try {
            this.model_id = modelId;
            
            // Load tokenizer
            this.tokenizer = await AutoTokenizer.from_pretrained(modelId, {
                progress_callback: (progress) => {
                    progress_callback?.({
                        status: 'initiate',
                        file: 'tokenizer',
                        ...progress
                    });
                }
            });
            
            // Load processor
            this.processor = await AutoProcessor.from_pretrained(modelId, {
                progress_callback: (progress) => {
                    progress_callback?.({
                        status: 'initiate',
                        file: 'processor',
                        ...progress
                    });
                }
            });

            // Load model
            this.model = await WhisperForConditionalGeneration.from_pretrained(modelId, {
                local: false,
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

        // Base generation config
        const generateConfig = {
            ...inputs,
            max_new_tokens: MAX_NEW_TOKENS,
            num_beams: 1,
            temperature: 0.0,
            return_dict_in_generate: false,
            output_scores: false
        };

        // Add language and task only for multilingual models
        if (!AutomaticSpeechRecognitionPipeline.model_id.endsWith('.en')) {
            generateConfig.language = options.language;
            generateConfig.task = 'transcribe';
        }

        const outputs = await model.generate(generateConfig);

        return tokenizer.batch_decode(outputs, { 
            skip_special_tokens: true,
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

async function load(modelId) {
    if (isLoaded) {
        console.log('Model already loaded');
        self.postMessage({ status: 'ready' });
        return;
    }

    console.log('Loading Whisper model:', modelId);
    
    self.postMessage({
        status: 'loading',
        data: `Loading ${modelId}...`
    });

    try {
        pipeline = AutomaticSpeechRecognitionPipeline.getInstance(modelId, progress => {
            self.postMessage(progress);
        });

        await pipeline; // Wait for initialization

        // Model warm-up
        console.log('Warming up model...');
        self.postMessage({
            status: 'loading',
            data: 'Compiling shaders and warming up model...'
        });

        const [tokenizer, processor, model] = await pipeline;
        
        // Warm up with proper configuration based on model type
        const warmupConfig = {
            input_features: full([1, 80, 3000], 0.0),
            max_new_tokens: 1,
            num_beams: 1,
            temperature: 0.0
        };

        // Add language and task only for multilingual models
        if (!modelId.endsWith('.en')) {
            warmupConfig.language = 'en';  // Always use English for warmup
            warmupConfig.task = 'transcribe';
        }

        await model.generate(warmupConfig);
        
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
            await load(data.modelId);
            break;

        case 'transcribe':
            // Add to queue if not already present
            if (!transcriptionQueue.has(data.segmentId)) {
                // Only include language for multilingual models
                const queueData = {
                    ...data,
                    isEnglishOnly: AutomaticSpeechRecognitionPipeline.model_id?.endsWith('.en'),
                    // Use provided language, fallback to English
                    language: data.language || 'en'
                };
                
                transcriptionQueue.set(data.segmentId, { type, data: queueData });
                console.log('Added to queue:', data.segmentId, 
                    'Queue size:', transcriptionQueue.size,
                    'Language:', queueData.isEnglishOnly ? 'en (English-only model)' : queueData.language,
                    'Model:', AutomaticSpeechRecognitionPipeline.model_id);
                
                // Try to process queue
                processQueue();
            } else {
                console.log('Segment already in queue:', data.segmentId);
            }
            break;
    }
});
