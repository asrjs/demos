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

        this.model_id = 'small-dsntt1-tr';
        
        console.log('Loading model...');

        try {
            // Load tokenizer
            this.tokenizer = await AutoTokenizer.from_pretrained(this.model_id, {
                progress_callback: (progress) => {
                    if (shouldLogProgress(progress.progress)) {
                        progress_callback?.({
                            status: 'initiate',
                            file: 'tokenizer',
                            ...progress
                        });
                    }
                },
                local: true,
            });
            
            // Load processor
            this.processor = await AutoProcessor.from_pretrained(this.model_id, {
                progress_callback: (progress) => {
                    if (shouldLogProgress(progress.progress)) {
                        progress_callback?.({
                            status: 'initiate',
                            file: 'processor',
                            ...progress
                        });
                    }
                },
                local: true,
            });

            // Load model
            this.model = await WhisperForConditionalGeneration.from_pretrained(this.model_id, {
                local: true,
                device: 'webgpu',
                progress_callback: (progress) => {
                    if (shouldLogProgress(progress.progress)) {
                        progress_callback?.({
                            status: 'initiate',
                            file: 'model',
                            ...progress
                        });
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

// Sadece model yükleme
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
        // Model dosyalarını kontrol et
        const testPath = `${env.localModelPath}/small-dsntt1-tr/config.json`;
        const response = await fetch(testPath);
        if (!response.ok) {
            throw new Error(`Failed to load config.json: ${response.status}`);
        }

        // Model, tokenizer ve processor'ı yükle
        await AutomaticSpeechRecognitionPipeline.getInstance(progress => {
            self.postMessage(progress);
        });

        // Model warm-up
        console.log('Warming up model...');
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
        console.log('Model ready');
        self.postMessage({ status: 'ready' });
    } catch (error) {
        console.error('Error loading model:', error);
        throw error;
    }
}

// Segment transkripsiyon işlemi
let processing = false;
async function transcribeSegment({ audioData, language, segmentId }) {
    if (processing) return;
    processing = true;

    try {
        self.postMessage({ status: 'start' });

        const [tokenizer, processor, model] = await AutomaticSpeechRecognitionPipeline.getInstance();

        let startTime;
        let numTokens = 0;
        const callback_function = (output) => {
            startTime ??= performance.now();
            let tps;
            if (numTokens++ > 0) {
                tps = numTokens / (performance.now() - startTime) * 1000;
            }
            self.postMessage({ status: 'update', output, tps, numTokens });
        }

        const streamer = new TextStreamer(tokenizer, {
            skip_prompt: true,
            skip_special_tokens: true,
            callback_function,
        });

        const inputs = await processor(audioData);
        const outputs = await model.generate({
            ...inputs,
            max_new_tokens: MAX_NEW_TOKENS,
            language,
            streamer,
        });

        const outputText = tokenizer.batch_decode(outputs, { skip_special_tokens: true });

        self.postMessage({
            status: 'complete',
            output: outputText,
            segmentId
        });
    } catch (error) {
        console.error('Transcription error:', error);
        self.postMessage({
            status: 'error',
            error: error.message,
            segmentId
        });
    } finally {
        processing = false;
    }
}

// Message handler
self.addEventListener('message', async (e) => {
    const { type, data } = e.data;

    switch (type) {
        case 'load':
            await load();
            break;

        case 'transcribe':
            await transcribeSegment(data);
            break;
    }
});
