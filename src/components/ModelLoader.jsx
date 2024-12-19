import React, { useState } from 'react';
import models from '../models.js';

const ModelLoader = ({ onLoadModel }) => {
    const [selectedModel, setSelectedModel] = useState('openai/whisper-tiny.en');
    const [backend, setBackend] = useState('webgpu');
    const [quantization, setQuantization] = useState('fp32');
    const [isLoading, setIsLoading] = useState(false);

    // Group models for the dropdown
    const groupedModels = {
        'Turkish Models': Object.entries(models).filter(([name, id]) => 
            id.includes('ysdede') || id.includes('dsntt1')),
        'English Models': Object.entries(models).filter(([name, id]) => 
            id.endsWith('.en')),
        'Multilingual Models': Object.entries(models).filter(([name, id]) => 
            !id.includes('ysdede') && 
            !id.includes('dsntt1') && 
            !id.endsWith('.en'))
    };

    const backends = [
        { id: 'webgpu', name: 'WebGPU' },
        { id: 'wasm', name: 'WASM (CPU)' },
    ];

    const quantizationOptions = [
        { id: 'fp32', name: 'FP32 (No Quantization)' },
        { id: 'fp16', name: 'FP16' },
        { id: 'int8', name: 'INT8' },
        { id: 'q8', name: 'Q8' },
        { id: 'q4', name: 'Q4' },
        { id: 'q4f16', name: 'Q4/FP16' },
        { id: 'bnb4', name: 'BNB4' },
    ];

    const handleLoadModel = async () => {
        setIsLoading(true);
        try {
            await onLoadModel({
                modelId: selectedModel,
                backend,
                quantization,
            });
        } catch (error) {
            console.error('Model loading error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center gap-2">
            {/* Model Selection */}
            <select 
                className="px-2 py-1 text-sm border rounded"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isLoading}
            >
                {Object.entries(groupedModels).map(([group, modelList]) => (
                    <optgroup key={group} label={group}>
                        {modelList.map(([name, id]) => (
                            <option key={id} value={id}>
                                {name}
                            </option>
                        ))}
                    </optgroup>
                ))}
            </select>

            {/* Backend Selection */}
            <select 
                className="px-2 py-1 text-sm border rounded"
                value={backend}
                onChange={(e) => setBackend(e.target.value)}
                disabled={isLoading}
            >
                {backends.map(b => (
                    <option key={b.id} value={b.id}>
                        {b.name}
                    </option>
                ))}
            </select>

            {/* Quantization Selection */}
            <select 
                className="px-2 py-1 text-sm border rounded"
                value={quantization}
                onChange={(e) => setQuantization(e.target.value)}
                disabled={isLoading}
            >
                {quantizationOptions.map(q => (
                    <option key={q.id} value={q.id}>
                        {q.name}
                    </option>
                ))}
            </select>

            {/* Load Button */}
            <button
                className={`px-3 py-1 text-sm text-white rounded ${
                    isLoading 
                        ? 'bg-gray-400 cursor-not-allowed' 
                        : 'bg-blue-500 hover:bg-blue-600'
                }`}
                onClick={handleLoadModel}
                disabled={isLoading}
            >
                {isLoading ? 'Loading...' : 'Load Model'}
            </button>
        </div>
    );
};

export default ModelLoader; 