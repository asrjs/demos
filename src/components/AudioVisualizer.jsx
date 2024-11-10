import { useRef, useCallback, useEffect, useState } from "react";

export function AudioVisualizer({ 
    stream, 
    threshold, 
    onThresholdChange, 
    silenceLength,
    onSilenceLengthChange,
    maxSilenceWithinSpeech,
    onMaxSilenceChange,
    endingSpeechTolerance,
    onEndingToleranceChange,
    endingEnergyThreshold,
    onEndingThresholdChange,
    className 
}) {
    const canvasRef = useRef(null);
    const levelBarRef = useRef(null);

    const visualize = useCallback((stream) => {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        const canvas = canvasRef.current;
        const levelBar = levelBarRef.current;
        const canvasCtx = canvas.getContext('2d');
        const levelCtx = levelBar.getContext('2d');
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const drawVisual = () => {
            requestAnimationFrame(drawVisual);
            analyser.getByteTimeDomainData(dataArray);

            // Draw waveform
            canvasCtx.fillStyle = 'rgb(255, 255, 255)';
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

            canvasCtx.lineWidth = 2;
            canvasCtx.strokeStyle = 'rgb(0, 0, 0)';
            canvasCtx.beginPath();

            const sliceWidth = canvas.width * 1.0 / bufferLength;
            let x = 0;

            // Calculate current audio level with adjusted range
            let sum = 0;
            for (let i = 0; i < bufferLength; ++i) {
                const v = dataArray[i] / 128.0;
                const y = v * canvas.height / 2;
                // Amplify the energy calculation
                sum += Math.abs(v - 1.0) * 4; // Multiply by 4 to amplify

                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    canvasCtx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            canvasCtx.lineTo(canvas.width, canvas.height / 2);
            canvasCtx.stroke();

            // Draw level bar with adjusted range
            const energy = Math.min(1, (sum / bufferLength) * 2); // Amplify and clamp to 1
            levelCtx.clearRect(0, 0, levelBar.width, levelBar.height);
            
            // Draw threshold line
            levelCtx.beginPath();
            levelCtx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
            levelCtx.moveTo(0, levelBar.height * (1 - threshold));
            levelCtx.lineTo(levelBar.width, levelBar.height * (1 - threshold));
            levelCtx.stroke();

            // Draw energy level
            const barHeight = energy * levelBar.height;
            levelCtx.fillStyle = energy > threshold ? 'rgb(0, 255, 0)' : 'rgb(200, 200, 200)';
            levelCtx.fillRect(0, levelBar.height - barHeight, levelBar.width, barHeight);
        };

        drawVisual();

        return () => {
            audioContext.close();
        };
    }, [threshold]);

    useEffect(() => {
        let cleanup;
        if (stream) {
            cleanup = visualize(stream);
        }
        return () => cleanup && cleanup();
    }, [visualize, stream]);

    return (
        <div className={className}>
            <canvas width={720} height={120} ref={canvasRef}></canvas>
            <div className="absolute top-0 right-0 flex items-center gap-2">
                {/* Energy threshold control */}
                <div className="flex flex-col items-center">
                    <span className="text-xs mb-1">Energy</span>
                    <div className="w-[30px] h-[120px] flex items-center justify-center">
                        <input
                            type="range"
                            min="0.005"
                            max="0.2"
                            step="0.005"
                            value={threshold}
                            onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
                            className="w-[120px] h-[30px] -rotate-90 origin-center"
                        />
                    </div>
                    <span className="text-xs mt-1">{threshold.toFixed(3)}</span>
                </div>

                {/* Silence between utterances control */}
                <div className="flex flex-col items-center">
                    <span className="text-xs mb-1">Gap</span>
                    <div className="w-[30px] h-[120px] flex items-center justify-center">
                        <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.1"
                            value={silenceLength}
                            onChange={(e) => onSilenceLengthChange(parseFloat(e.target.value))}
                            className="w-[120px] h-[30px] -rotate-90 origin-center"
                        />
                    </div>
                    <span className="text-xs mt-1">{silenceLength.toFixed(1)}s</span>
                </div>

                {/* Add new control for maxSilenceWithinSpeech */}
                <div className="flex flex-col items-center">
                    <span className="text-xs mb-1">Word Gap</span>
                    <div className="w-[30px] h-[120px] flex items-center justify-center">
                        <input
                            type="range"
                            min="0.1"
                            max="0.8"
                            step="0.1"
                            value={maxSilenceWithinSpeech}
                            onChange={(e) => onMaxSilenceChange(parseFloat(e.target.value))}
                            className="w-[120px] h-[30px] -rotate-90 origin-center"
                        />
                    </div>
                    <span className="text-xs mt-1">{maxSilenceWithinSpeech.toFixed(1)}s</span>
                </div>

                {/* Add control for ending speech tolerance */}
                <div className="flex flex-col items-center">
                    <span className="text-xs mb-1">End Tol</span>
                    <div className="w-[30px] h-[120px] flex items-center justify-center">
                        <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.1"
                            value={endingSpeechTolerance}
                            onChange={(e) => onEndingToleranceChange(parseFloat(e.target.value))}
                            className="w-[120px] h-[30px] -rotate-90 origin-center"
                            title="Ending Speech Tolerance"
                        />
                    </div>
                    <span className="text-xs mt-1">{endingSpeechTolerance.toFixed(1)}s</span>
                </div>

                {/* Add control for ending energy threshold */}
                <div className="flex flex-col items-center">
                    <span className="text-xs mb-1">End Thr</span>
                    <div className="w-[30px] h-[120px] flex items-center justify-center">
                        <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.1"
                            value={endingEnergyThreshold}
                            onChange={(e) => onEndingThresholdChange(parseFloat(e.target.value))}
                            className="w-[120px] h-[30px] -rotate-90 origin-center"
                            title="Ending Energy Threshold"
                        />
                    </div>
                    <span className="text-xs mt-1">{endingEnergyThreshold.toFixed(1)}</span>
                </div>

                {/* Level indicator */}
                <canvas 
                    ref={levelBarRef} 
                    width={30} 
                    height={120}
                    className="border-l border-gray-300"
                />
            </div>
        </div>
    );
}
