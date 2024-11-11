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

const MAX_NEW_TOKENS = 64;

// Simplify progress logging
function shouldLogProgress(progress) {
    return progress <= 1 || progress >= 99;
}

class AutomaticSpeechRecognitionPipeline {
    static model_id = null;
    static tokenizer = null;
    static processor = null;
    static model = null;
    static isInitialized = false;

    static async getInstance(progress_callback = null) {
        if (this.isInitialized) {
            return Promise.all([this.tokenizer, this.processor, this.model]);
        }

        this.model_id = 'base-dsntt1-tr';
        
        console.log('Loading model...');

        try {
            this.tokenizer = await AutoTokenizer.from_pretrained(this.model_id, {
                progress_callback: (progress) => {
                    if (shouldLogProgress(progress.progress)) {
                        progress_callback?.(progress);
                    }
                },
                local: true,
            });
            
            this.processor = await AutoProcessor.from_pretrained(this.model_id, {
                progress_callback: (progress) => {
                    if (shouldLogProgress(progress.progress)) {
                        progress_callback?.(progress);
                    }
                },
                local: true,
            });

            this.model = await WhisperForConditionalGeneration.from_pretrained(this.model_id, {
                local: true,
                device: 'webgpu',
                progress_callback: (progress) => {
                    if (shouldLogProgress(progress.progress)) {
                        progress_callback?.(progress);
                    }
                },
            });

            this.isInitialized = true;
            console.log('Model loaded');
            return [this.tokenizer, this.processor, this.model];
        } catch (error) {
            console.error('Error:', error.message);
            throw error;
        }
    }
}

let isLoaded = false;

async function load() {
    if (isLoaded) {
        console.log('Model already loaded, skipping initialization');
        self.postMessage({ status: 'ready' });
        return;
    }

    console.log('Starting model load...');
    
    self.postMessage({
        status: 'loading',
        data: 'Loading model...'
    });

    try {
        const testPath = `${env.localModelPath}/base-dsntt1-tr/config.json`;
        console.log('Attempting to access:', testPath);
        
        const response = await fetch(testPath);
        if (!response.ok) {
            throw new Error(`Failed to load config.json: ${response.status}`);
        }
        console.log('Successfully accessed config.json');

        await AutomaticSpeechRecognitionPipeline.getInstance(x => {
            console.log('Loading progress:', x);
            self.postMessage(x);
        });

        console.log('Model loaded successfully, warming up...');
        
        self.postMessage({
            status: 'loading',
            data: 'Compiling shaders and warming up model...'
        });

        const [,,model] = await AutomaticSpeechRecognitionPipeline.getInstance();
        await model.generate({
            input_features: full([1, 80, 3000], 0.0),
            max_new_tokens: 1,
        });
        
        isLoaded = true;
        console.log('Warm-up complete');
        self.postMessage({ status: 'ready' });
    } catch (error) {
        console.error('Error in load():', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

let processing = false;
async function generate({ audio, language, segmentId }) {
    if (processing) return;
    processing = true;

    // Tell the main thread we are starting
    self.postMessage({ status: 'start' });

    // Retrieve the text-generation pipeline.
    const [tokenizer, processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance();

    let startTime;
    let numTokens = 0;
    const callback_function = (output) => {
        startTime ??= performance.now();

        let tps;
        if (numTokens++ > 0) {
            tps = numTokens / (performance.now() - startTime) * 1000;
        }
        self.postMessage({
            status: 'update',
            output, tps, numTokens,
        });
    }

    const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function,
    });

    const inputs = await processor(audio);

    const outputs = await model.generate({
        ...inputs,
        max_new_tokens: MAX_NEW_TOKENS,
        language,
        streamer,
    });

    const outputText = tokenizer.batch_decode(outputs, { skip_special_tokens: true });

    // Send the output back to the main thread with segmentId
    self.postMessage({
        status: 'complete',
        output: outputText,
        segmentId
    });
    processing = false;
}

// Listen for messages from the main thread
self.addEventListener('message', async (e) => {
    const { type, data } = e.data;

    switch (type) {
        case 'load':
            load();
            break;

        case 'generate':
            generate(data);
            break;
    }
});
