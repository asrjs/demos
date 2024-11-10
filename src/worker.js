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

// Debug logging function
function debugLog(message, data = null) {
    const logMessage = data ? `${message}: ${JSON.stringify(data)}` : message;
    console.log(logMessage);
    self.postMessage({ status: 'debug', message: logMessage });
}

const MAX_NEW_TOKENS = 64;

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

        // this.model_id = 'base-dsntt1-tr';
        this.model_id = 'small-dsntt1-tr';
        
        debugLog('Attempting to load model from:', {
            modelId: this.model_id,
            fullPath: `${env.localModelPath}/${this.model_id}`
        });

        try {
            debugLog('Loading tokenizer...');
            this.tokenizer = await AutoTokenizer.from_pretrained(this.model_id, {
                progress_callback,
                local: true,
            });
            
            debugLog('Loading processor...');
            this.processor = await AutoProcessor.from_pretrained(this.model_id, {
                progress_callback,
                local: true,
            });

            debugLog('Loading model...');
            this.model = await WhisperForConditionalGeneration.from_pretrained(this.model_id, {
                local: true,
                device: 'webgpu',
                progress_callback,
            });

            this.isInitialized = true;
            debugLog('Model pipeline initialized successfully');
            return [this.tokenizer, this.processor, this.model];
        } catch (error) {
            debugLog('Error loading model:', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
}

let isLoaded = false;

async function load() {
    if (isLoaded) {
        debugLog('Model already loaded, skipping initialization');
        self.postMessage({ status: 'ready' });
        return;
    }

    debugLog('Starting model load...');
    
    self.postMessage({
        status: 'loading',
        data: 'Loading model...'
    });

    try {
        const testPath = `${env.localModelPath}/base-dsntt1-tr/config.json`;
        debugLog('Attempting to access:', testPath);
        
        const response = await fetch(testPath);
        if (!response.ok) {
            throw new Error(`Failed to load config.json: ${response.status}`);
        }
        debugLog('Successfully accessed config.json');

        await AutomaticSpeechRecognitionPipeline.getInstance(x => {
            debugLog('Loading progress:', x);
            self.postMessage(x);
        });

        debugLog('Model loaded successfully, warming up...');
        
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
        debugLog('Warm-up complete');
        self.postMessage({ status: 'ready' });
    } catch (error) {
        debugLog('Error in load():', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

let processing = false;
async function generate({ audio, language }) {
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

    // Send the output back to the main thread
    self.postMessage({
        status: 'complete',
        output: outputText,
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
