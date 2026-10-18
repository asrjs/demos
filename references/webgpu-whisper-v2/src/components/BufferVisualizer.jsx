import { useRef, useEffect, useCallback, useState } from "react";
import { audioManager } from "../AudioManager";

export function BufferVisualizer({ threshold = 0.02, segments = [] }) {
    const canvasRef = useRef(null);
    const energyCanvasRef = useRef(null);
    const lastUpdateRef = useRef(0);
    const lastEnergyUpdateRef = useRef(0);

    const drawWaveform = useCallback((canvas, audioData) => {
        const ctx = canvas.getContext('2d', {
            alpha: false,
            desynchronized: true
        });

        // Clear canvas
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (!audioData?.length) return;

        const centerY = canvas.height / 2;
        const scale = canvas.height / 2;
        
        ctx.strokeStyle = '#c8c8c8';
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Skip points for better performance
        const skipPoints = 16;
        for (let i = 0; i < audioData.length; i += skipPoints) {
            const x = (i / audioData.length) * canvas.width;
            const y = centerY + (audioData[i] || 0) * scale;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Get current time for relative segment positioning
        const currentTime = audioManager.getCurrentTime();
        const bufferDuration = 30; // 30 seconds visualization window
        const windowStart = currentTime - bufferDuration;

        // Draw segments
        segments.forEach(segment => {
            // Calculate relative position in the visualization window
            const relativeStart = segment.startTime - windowStart;
            const relativeEnd = segment.endTime - windowStart;

            // Only draw if segment is within the visible window
            if (relativeEnd > 0 && relativeStart < bufferDuration) {
                const startX = Math.max(0, (relativeStart / bufferDuration)) * canvas.width;
                const endX = Math.min(1, (relativeEnd / bufferDuration)) * canvas.width;

                ctx.fillStyle = segment.isMerged ? 'rgba(128, 0, 128, 0.2)' :
                              segment.isPartOfMerged ? 'rgba(255, 165, 0, 0.1)' :
                              segment.isProcessed ? 'rgba(0, 200, 0, 0.1)' :
                              'rgba(255, 200, 0, 0.1)';
                
                ctx.fillRect(startX, 0, endX - startX, canvas.height);

                // Draw segment boundaries
                ctx.strokeStyle = segment.isMerged ? 'rgba(128, 0, 128, 0.5)' : 'rgba(255, 200, 0, 0.5)';
                ctx.beginPath();
                ctx.moveTo(startX, 0);
                ctx.lineTo(startX, canvas.height);
                ctx.moveTo(endX, 0);
                ctx.lineTo(endX, canvas.height);
                ctx.stroke();

                // Draw timestamp
                ctx.fillStyle = '#666';
                ctx.font = '10px Arial';
                // ctx.fillText(`${relativeStart.toFixed(1)}s`, startX + 2, 10);
            }
        });

        // Draw time markers
        ctx.fillStyle = '#666';
        ctx.font = '10px Arial';
        for (let i = 0; i <= bufferDuration; i += 5) {
            const x = (i / bufferDuration) * canvas.width;
            const time = windowStart + i;
            ctx.fillText(`${time.toFixed(0)}s`, x, canvas.height - 2);
        }
    }, [segments]);

    const drawEnergyLevel = useCallback((ctx, canvas, energy, threshold) => {
        if (!ctx || !canvas || typeof energy !== 'number') return;

        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw threshold line
        const thresholdX = threshold * canvas.width;
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(thresholdX, 0);
        ctx.lineTo(thresholdX, canvas.height);
        ctx.stroke();

        // Draw energy level
        const energyWidth = Math.min(energy * canvas.width, canvas.width);
        ctx.fillStyle = energy > threshold ? '#4CAF50' : '#2196F3';
        ctx.fillRect(0, 0, energyWidth, canvas.height);

        // Draw value
        ctx.fillStyle = '#666';
        ctx.font = '12px Arial';
        ctx.fillText(`${energy.toFixed(3)}`, 5, canvas.height - 5);
    }, []);

    useEffect(() => {
        if (!canvasRef.current) return;
        
        const updateInterval = setInterval(() => {
            const now = performance.now();
            if (now - lastUpdateRef.current < 50) return;
            
            const visualizationData = audioManager.getVisualizationData();
            const metrics = audioManager.getMetrics();
            
            drawWaveform(canvasRef.current, visualizationData);
            
            if (energyCanvasRef.current) {
                drawEnergyLevel(
                    energyCanvasRef.current.getContext('2d'),
                    energyCanvasRef.current,
                    metrics.currentEnergy,
                    threshold
                );
            }
            
            lastUpdateRef.current = now;
        }, 100);

        return () => clearInterval(updateInterval);
    }, [threshold, drawWaveform, drawEnergyLevel]);

    return (
        <div className="flex flex-col gap-2">
            <canvas 
                ref={energyCanvasRef}
                width={480}
                height={24}
                className="w-full border rounded bg-[#f5f5f5]"
            />
            
            <canvas 
                ref={canvasRef} 
                width={480} 
                height={80}
                className="w-full border rounded bg-[#f5f5f5]"
            />
        </div>
    );
}