import { useRef, useEffect, useCallback, useState } from "react";
import { audioManager } from "../AudioManager";

export function BufferVisualizer({ chunks, audioContextRef, segments = [], energyValues, threshold = 0.02 }) {
    const canvasRef = useRef(null);
    const lastUpdateRef = useRef(0);
    const lastChunksLengthRef = useRef(0);
    const lastBufferStateRef = useRef({ isBufferFull: false });
    const UPDATE_INTERVAL = 100;
    const MAX_DURATION = 30;
    const SKIP_POINTS = 16;

    const [currentEnergy, setCurrentEnergy] = useState(0);
    const energyCanvasRef = useRef(null);

    const drawSegments = useCallback((ctx, segments, totalDuration, canvas) => {
        const isBufferFull = totalDuration > MAX_DURATION;
        const visibleDuration = isBufferFull ? MAX_DURATION : totalDuration;
        const windowStart = isBufferFull ? totalDuration - MAX_DURATION : 0;

        segments.forEach(segment => {
            const normalizedStart = isBufferFull 
                ? (segment.startTime - windowStart) 
                : segment.startTime;
            const normalizedEnd = isBufferFull 
                ? (segment.endTime - windowStart) 
                : segment.endTime;

            const startX = (normalizedStart / visibleDuration) * canvas.width;
            const endX = (normalizedEnd / visibleDuration) * canvas.width;

            if (normalizedStart <= visibleDuration && normalizedEnd >= 0) {
                ctx.fillStyle = segment.isMerged ? 'rgba(128, 0, 128, 0.2)' :
                              segment.isPartOfMerged ? 'rgba(255, 165, 0, 0.1)' :
                              segment.isProcessed ? 'rgba(0, 200, 0, 0.1)' :
                              'rgba(255, 200, 0, 0.1)';
                
                ctx.fillRect(startX, 0, endX - startX, canvas.height);

                ctx.strokeStyle = segment.isMerged ? 
                    'rgba(128, 0, 128, 0.5)' : 
                    'rgba(0, 100, 200, 0.5)';
                ctx.beginPath();
                ctx.moveTo(startX, 0);
                ctx.lineTo(startX, canvas.height);
                ctx.moveTo(endX, 0);
                ctx.lineTo(endX, canvas.height);
                ctx.stroke();

                ctx.fillStyle = '#666';
                ctx.font = '10px Arial';
                ctx.fillText(`${segment.startTime.toFixed(1)}s`, startX + 2, 10);
            }
        });
    }, []);

    const drawWaveform = useCallback((ctx, audioData, canvas, totalDuration) => {
        const isBufferFull = totalDuration > MAX_DURATION;
        const visibleDuration = isBufferFull ? MAX_DURATION : totalDuration;

        const visibleSamples = isBufferFull 
            ? Math.min(audioData.length, MAX_DURATION * audioContextRef.current.sampleRate)
            : audioData.length;
        
        const startIndex = isBufferFull 
            ? audioData.length - visibleSamples 
            : 0;

        const centerY = canvas.height / 2;
        const scale = canvas.height / 2;
        
        ctx.strokeStyle = '#c8c8c8';
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let i = 0; i < visibleSamples; i += SKIP_POINTS) {
            const x = (i / visibleSamples) * canvas.width;
            const dataIndex = startIndex + i;
            const y = centerY + (audioData[dataIndex] || 0) * scale;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }, []);

    const drawEnergyLevel = useCallback((ctx, canvas, energy, threshold) => {
        if (!ctx || !canvas || typeof energy !== 'number') return;

        // Clear the energy canvas
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const height = canvas.height;
        const width = canvas.width;

        // Draw background grid
        ctx.strokeStyle = '#e5e5e5';
        ctx.beginPath();
        for (let i = 0; i <= 1; i += 0.2) {
            const y = height * (1 - i);
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();

        // Draw threshold line
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const thresholdY = height * (1 - threshold);
        ctx.moveTo(0, thresholdY);
        ctx.lineTo(width, thresholdY);
        ctx.stroke();

        // Draw current energy level
        const energyHeight = Math.min(energy * height, height);
        ctx.fillStyle = energy > threshold ? '#4CAF50' : '#2196F3';
        ctx.fillRect(0, height - energyHeight, width, energyHeight);

        // Draw energy value text
        ctx.fillStyle = '#666';
        ctx.font = '12px Arial';
        ctx.fillText(`Energy: ${energy.toFixed(4)}`, 5, 15);
        ctx.fillText(`Threshold: ${threshold.toFixed(4)}`, 5, 30);
    }, []);

    useEffect(() => {
        const now = Date.now();
        if (now - lastUpdateRef.current < UPDATE_INTERVAL) return;
        if (!chunks.length || !canvasRef.current) return;
        if (chunks.length === lastChunksLengthRef.current) return;

        lastUpdateRef.current = now;
        lastChunksLengthRef.current = chunks.length;

        const canvas = canvasRef.current;
        const energyCanvas = energyCanvasRef.current;
        if (!canvas || !energyCanvas) return;

        const ctx = canvas.getContext('2d', {
            alpha: false,
            desynchronized: true
        });

        const energyCtx = energyCanvas.getContext('2d', {
            alpha: false,
            desynchronized: true
        });

        const processAudioData = async () => {
            // Create combined audio data from chunks
            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const audioData = new Float32Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
                audioData.set(chunk, offset);
                offset += chunk.length;
            }

            const totalDuration = totalLength / audioContextRef.current.sampleRate;

            // Clear canvas ONCE
            ctx.fillStyle = '#f5f5f5';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw layers in order
            drawWaveform(ctx, audioData, canvas, totalDuration);
            drawSegments(ctx, segments, totalDuration, canvas);
            drawTimeMarkers(ctx, totalDuration, canvas);

            // Calculate current energy level from the most recent chunk
            if (chunks.length > 0) {
                const latestChunk = chunks[chunks.length - 1];
                let energy = 0;
                for (let i = 0; i < latestChunk.length; i++) {
                    energy += latestChunk[i] * latestChunk[i];
                }
                energy = Math.sqrt(energy / latestChunk.length);
                setCurrentEnergy(energy);
                
                // Draw energy level
                drawEnergyLevel(energyCtx, energyCanvas, energy, threshold);
            }
        };

        processAudioData().catch(console.error);
    }, [chunks, segments, drawSegments, drawWaveform, drawEnergyLevel, threshold]);

    const drawTimeMarkers = (ctx, totalDuration, canvas) => {
        const isBufferFull = totalDuration > MAX_DURATION;
        const visibleDuration = isBufferFull ? MAX_DURATION : totalDuration;
        const windowStart = isBufferFull ? totalDuration - MAX_DURATION : 0;

        ctx.fillStyle = '#666';
        ctx.font = '10px Arial';
        for (let i = 0; i <= visibleDuration; i += 5) {
            const x = (i / visibleDuration) * canvas.width;
            const time = windowStart + i;
            ctx.fillText(`${time.toFixed(0)}s`, x, canvas.height - 2);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            {/* Energy level visualizer */}
            <canvas 
                ref={energyCanvasRef}
                width={480}
                height={60}
                className="w-full border rounded bg-[#f5f5f5]"
            />
            
            {/* Existing waveform canvas */}
            <canvas 
                ref={canvasRef} 
                width={480} 
                height={160}
                className="w-full border rounded bg-[#f5f5f5]"
            />
        </div>
    );
}