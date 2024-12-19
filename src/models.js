// Available Whisper models
export const models = {
    // Turkish optimized models
    'Whisper Tiny Tr': 'ysdede/whisper-tiny-dsntt1-onnx',
    'Whisper Base Tr': 'ysdede/whisper-base-dsntt1-tr-onnx',
    'Whisper Small Tr': 'ysdede/whisper-small-dsntt1-tr-onnx',

    // Standard models
    'Whisper Small': 'onnx-community/whisper-small',
    'Whisper Base': 'onnx-community/whisper-base',
    'Whisper Tiny': 'onnx-community/whisper-tiny',
    'Whisper Small En': 'onnx-community/whisper-small.en',
    'Whisper Base En': 'onnx-community/whisper-base.en',
    'Whisper Tiny En': 'onnx-community/whisper-tiny.en'
};

// Model size information (approximate sizes in MB)
export const modelSizes = {
    'Whisper Tiny Tr': 151,
    'Whisper Base Tr': 292,
    'Whisper Small Tr': 969,
    'Whisper Small': 969,
    'Whisper Base': 292,
    'Whisper Tiny': 151,
    'Whisper Small En': 969,
    'Whisper Base En': 292,
    'Whisper Tiny En': 151
};

// Default model
export const defaultModel = 'Whisper Base Tr';

export default models;
