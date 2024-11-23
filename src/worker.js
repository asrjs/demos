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

// Softmax helper function remains the same
function softmax(logits) {
    const maxLogit = Math.max(...logits);
    const scores = logits.map(l => Math.exp(l - maxLogit));
    const sum = scores.reduce((a, b) => a + b, 0);
    return scores.map(s => s / sum);
}

async function transcribeAudio(audioData, options) {
    try {
        const [tokenizer, processor, model] = await pipeline;
        
        // Process audio data
        const inputs = await processor(audioData);
        console.log('Processor outputs:', {
            hasInputFeatures: !!inputs.input_features,
            inputFeatureType: inputs.input_features ? inputs.input_features.constructor.name : null,
            tensorShape: inputs.input_features?.dims || null
        });

        // Skip direct model call and use generate with return_dict
        const generateConfig = {
            max_new_tokens: MAX_NEW_TOKENS,
            num_beams: 1,
            temperature: 0.0,
            return_dict_in_generate: true,
            output_hidden_states: true, // Enable hidden states output
            input_features: inputs.input_features
        };

        // Add language and task only for multilingual models
        if (!AutomaticSpeechRecognitionPipeline.model_id.endsWith('.en')) {
            generateConfig.language = options.language;
            generateConfig.task = 'transcribe';
        }

        // Generate text and get hidden states
        const outputs = await model.generate(generateConfig);
        
        console.log('Generation outputs:', {
            hasSequences: !!outputs.sequences,
            hasHiddenStates: !!outputs.decoder_hidden_states,
            outputKeys: Object.keys(outputs)
        });

        // Get sequences from generate output
        const sequences = outputs.sequences;
        if (!sequences) {
            console.error('No sequences in model outputs');
            return { text: '', words: [] };
        }

        // Get hidden states for confidence calculation
        const hiddenStates = outputs.decoder_hidden_states;
        
        // Decode the full text
        const transcription = tokenizer.batch_decode(sequences, { 
            skip_special_tokens: true 
        })[0];

        // Process tokens and compute word probabilities
        const words = [];
        let currentWord = '';
        let currentProb = 1.0;
        
        // Convert token IDs to array if it's a tensor
        const tokenArray = Array.isArray(sequences[0]) ? sequences[0] : Array.from(sequences[0]);
        
        console.log('Processing tokens:', {
            numTokens: tokenArray.length,
            hasHiddenStates: !!hiddenStates,
            hiddenStatesLength: hiddenStates?.length || 0
        });

        for (let i = 0; i < tokenArray.length; i++) {
            const token = tokenArray[i];
            const tokenText = tokenizer.decode([token], { skip_special_tokens: true });

            if (!tokenText) continue;

            // Compute token probability using hidden states
            let tokenProb = 0.7; // Default probability
            if (hiddenStates && hiddenStates[i]) {
                // Use L2 norm of hidden state as confidence score
                const hiddenState = Array.from(hiddenStates[i][0]); // Get hidden state for current token
                const norm = Math.sqrt(hiddenState.reduce((sum, val) => sum + val * val, 0));
                tokenProb = Math.max(0.1, Math.min(0.99, norm / Math.sqrt(hiddenState.length)));
                
                console.log(`Token "${tokenText}":`, {
                    id: token,
                    probability: tokenProb.toFixed(4),
                    norm: norm.toFixed(4)
                });
            }

            // Handle word boundaries
            if (tokenText.startsWith(' ') || tokenText.includes('\n')) {
                if (currentWord) {
                    // Calculate word probability as geometric mean of token probabilities
                    const finalProb = Math.pow(currentProb, 1/currentWord.length);
                    words.push({
                        text: currentWord,
                        probability: finalProb
                    });
                    console.log('Completed Word:', {
                        word: currentWord,
                        rawProb: currentProb.toFixed(4),
                        normalizedProb: finalProb.toFixed(4)
                    });
                    currentWord = '';
                    currentProb = 1.0;
                }
                currentWord = tokenText.trim();
            } else {
                currentWord += tokenText;
            }

            currentProb *= tokenProb;
        }

        // Add final word if exists
        if (currentWord) {
            const finalProb = Math.pow(currentProb, 1/currentWord.length);
            words.push({
                text: currentWord,
                probability: finalProb
            });
            console.log('Final Word:', {
                word: currentWord,
                rawProb: currentProb.toFixed(4),
                normalizedProb: finalProb.toFixed(4)
            });
        }

        console.log('Word-level probabilities:', words);

        return {
            text: transcription,
            words
        };

    } catch (error) {
        console.error('Transcription error:', error);
        throw error;
    }
}

async function processQueue() {
    if (isProcessing || transcriptionQueue.size === 0) return;
    
    isProcessing = true;
    
    try {
        const [firstTaskId] = transcriptionQueue.keys();
        const task = transcriptionQueue.get(firstTaskId);
        
        console.log('Processing task:', task.data.segmentId);

        try {
            const result = await transcribeAudio(task.data.audioData, {
                language: task.data.language
            });

            self.postMessage({
                status: 'complete',
                segmentId: task.data.segmentId,
                output: result.text,
                words: result.words,
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

        transcriptionQueue.delete(firstTaskId);

    } catch (error) {
        console.error('Queue processing error:', error);
    } finally {
        isProcessing = false;
        if (transcriptionQueue.size > 0) {
            setTimeout(processQueue, 100);
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
            input_features: new Float32Array(1 * 80 * 3000).fill(0.0), // Corrected input_features shape
            max_new_tokens: 1,
            num_beams: 1,
            temperature: 0.0
        };

        // Add language and task only for multilingual models
        if (!modelId.endsWith('.en')) {
            warmupConfig.language = 'en';  // Always use English for warmup
            warmupConfig.task = 'transcribe';
        }

        // await model.generate(warmupConfig);
        
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
