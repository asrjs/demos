import { useEffect, useState, useRef, useCallback } from 'react';

import { AudioVisualizer } from './components/AudioVisualizer';
import Progress from './components/Progress';
import { StatsWidget } from './components/StatsWidget';
import { SpeechSegment } from './SpeechSegment';
import { AudioSegmentProcessor } from './AudioSegmentProcessor';
import { AudioManager, audioManager } from './AudioManager';
import { AudioSegmentsWidget } from './components/AudioSegmentsWidget';

const IS_WEBGPU_AVAILABLE = !!navigator.gpu;

const WHISPER_SAMPLING_RATE = 16_000;
const MAX_AUDIO_LENGTH = 30; // seconds
const MAX_SAMPLES = WHISPER_SAMPLING_RATE * MAX_AUDIO_LENGTH;

const LANGUAGES = [
    { value: 'tr', label: 'Turkish' },
    { value: 'en', label: 'English' }
];

const PROCESS_INTERVAL = 250;  // Process every 250ms
const BUFFER_WINDOW = 15;      // Keep last 15 seconds for processing

function App() {

  // Create refs first
  const worker = useRef(null);
  const recorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const addLogRef = useRef(null);
  const transcriptionManagerRef = useRef(null);
  const audioManagerRef = useRef(null);
  const audioBufferRef = useRef(null);
  const lastProcessedTimeRef = useRef(0);
  const lastProcessTimeRef = useRef(0);
  const processingIntervalRef = useRef(null);
  const chunksRef = useRef([]);

  // Model and processing state
  const [status, setStatus] = useState('initialized'); // Change default state
  const [loadingMessage, setLoadingMessage] = useState('');
  const [progressItems, setProgressItems] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recording, setRecording] = useState(false);

  // Audio parameters state
  const [audioThreshold, setAudioThreshold] = useState(0.02);
  const [silenceLength, setSilenceLength] = useState(0.3);
  const [speechHangover, setSpeechHangover] = useState(0.2);
  const [energyScale, setEnergyScale] = useState(2.0);
  const [hysteresisRatio, setHysteresisRatio] = useState(1.2);
  const [minSpeechDuration, setMinSpeechDuration] = useState(0.1);
  const [maxSilenceWithinSpeech, setMaxSilenceWithinSpeech] = useState(0.3);
  const [endingSpeechTolerance, setEndingSpeechTolerance] = useState(0.4);
  const [endingEnergyThreshold, setEndingEnergyThreshold] = useState(0.6);

  // Audio data state
  const [chunks, setChunks] = useState([]);
  const [stream, setStream] = useState(null);
  const [segments, setSegments] = useState([]);
  const [text, setText] = useState('');
  const [tps, setTps] = useState(null);
  const [language, setLanguage] = useState('tr');

  // Initialize AudioManager without audio context
  useEffect(() => {
    console.log('Initializing AudioManager');
    
    audioManager.initialize({
        sampleRate: WHISPER_SAMPLING_RATE,
        onSegmentDetected: (segment) => {
            setSegments(prev => [...prev, segment]);
        }
    }).catch(error => {
        console.error('Failed to initialize AudioManager:', error);
    });

    // Set initial parameters
    audioManager.updateParameters({
        threshold: audioThreshold,
        silenceLength,
        speechHangover,
        energyScale,
        hysteresisRatio,
        minSpeechDuration
    });

    return () => {
        audioManager.reset();
    };
  }, []); // Run once on mount

  // Add user interaction handler
  const handleStartAudio = async () => {
    try {
        await audioManager.startAudioContext();
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setStream(stream);
        
        // Load audio worklet module first
        await audioManager.audioContext.audioWorklet.addModule('src/audio-processor.js');
        
        const source = audioManager.audioContext.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioManager.audioContext, 'audio-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            processorOptions: {
                sampleRate: WHISPER_SAMPLING_RATE
            }
        });

        workletNode.port.onmessage = (event) => {
            if (event.data.type === 'audio_data') {
                const chunk = event.data.audioData;
                setChunks(prev => [...prev, chunk]);
                audioManager.processNewChunk(chunk);
            }
        };

        source.connect(workletNode);
        workletNode.connect(audioManager.audioContext.destination);
        setRecording(true);

        // Store references for cleanup
        audioContextRef.current = audioManager.audioContext;

    } catch (error) {
        console.error('Failed to start audio:', error);
        // Add more detailed error information
        if (error.name === 'NotAllowedError') {
            console.error('Microphone permission denied');
        } else if (error.name === 'NotFoundError') {
            console.error('No microphone found');
        } else {
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
        }
    }
  };

  // Process buffer periodically
  useEffect(() => {
    if (status === 'ready' && recording) {
      console.log('Setting up process interval');
      let lastProcessTime = 0;
      
      const processInterval = setInterval(async () => {
        const currentTime = Date.now();
        if (currentTime - lastProcessTime < PROCESS_INTERVAL) {
          return;
        }
        
        const currentChunks = chunksRef.current;
        if (!currentChunks.length) return;

        try {
          // Get the last 30 seconds worth of samples
          const samplesFor30Sec = 30 * audioContextRef.current.sampleRate;
          const audioData = new Float32Array(samplesFor30Sec);
          let writeOffset = audioData.length;

          // Fill buffer from newest to oldest chunks
          for (let i = currentChunks.length - 1; i >= 0 && writeOffset > 0; i--) {
            const chunk = currentChunks[i];
            if (!(chunk instanceof Float32Array)) continue;

            const copySize = Math.min(writeOffset, chunk.length);
            const startPos = chunk.length - copySize;
            
            audioData.set(
              chunk.slice(startPos, startPos + copySize),
              writeOffset - copySize
            );
            writeOffset -= copySize;
          }

          // Only process if we have significant audio
          const maxValue = Math.max(...Array.from(audioData.slice(0, 1000)).map(Math.abs));
          if (maxValue > 0.1) {
            console.log('Processing high-volume audio:', {
              maxValue: maxValue.toFixed(3),
              time: currentTime
            });
            
            // Process using AudioManager
            await audioManager.processNewChunk(audioData);
          }

          lastProcessTime = currentTime;
        } catch (error) {
          console.error('Error in process interval:', error);
        }
      }, PROCESS_INTERVAL);

      return () => clearInterval(processInterval);
    }
  }, [status, recording]);

  // Initialize worker in useEffect
  useEffect(() => {
    if (!worker.current) {
      worker.current = new Worker(new URL('./worker.js', import.meta.url), {
        type: 'module'
      });

      // Handle worker messages
      const onMessageReceived = (e) => {
        switch (e.data.status) {
          case 'loading':
            setStatus('loading');
            setLoadingMessage(e.data.data);
            break;

          case 'initiate':
            setProgressItems(prev => [...prev, e.data]);
            break;

          case 'progress':
            setProgressItems(
              prev => prev.map(item => {
                if (item.file === e.data.file) {
                  return { ...item, ...e.data }
                }
                return item;
              })
            );
            break;

          case 'done':
            setProgressItems(
              prev => prev.filter(item => item.file !== e.data.file)
            );
            break;

          case 'ready':
            setStatus('ready');
            if (recorderRef.current && recorderRef.current.state !== 'recording') {
              try {
                recorderRef.current.start();
              } catch (error) {
                console.error('Failed to start recording:', error);
                setTimeout(() => {
                  if (recorderRef.current && recorderRef.current.state !== 'recording') {
                    recorderRef.current.start();
                  }
                }, 100);
              }
            }
            break;

          case 'start':
            setIsProcessing(true);
            recorderRef.current?.requestData();
            break;

          case 'update':
            setTps(e.data.tps);
            break;

          case 'complete':
            setIsProcessing(false);
            setText(prev => prev + ' ' + e.data.output);
            if (e.data.segmentId !== undefined) {
              setSegments(prev => prev.map((seg, idx) => 
                idx === e.data.segmentId 
                  ? { ...seg, isProcessed: true, transcription: e.data.output }
                  : seg
              ));
            }
            break;
        }

        // Let TranscriptionManager handle transcription-related messages
        transcriptionManagerRef.current?.handleWorkerMessage(e.data);
      };

      worker.current.addEventListener('message', onMessageReceived);

      // Cleanup
      return () => {
        worker.current.removeEventListener('message', onMessageReceived);
        worker.current.terminate();
        worker.current = null;
      };
    }
  }, []); // Empty dependency array - only run once on mount

  // Initialize MediaRecorder when model is ready
  useEffect(() => {
    if (status === 'ready' && !recorderRef.current) {
        addLog('Initializing MediaRecorder - model is ready');

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(async stream => {
                setStream(stream);
                audioContextRef.current = new AudioContext({ sampleRate: WHISPER_SAMPLING_RATE });
                
                try {
                    await audioContextRef.current.audioWorklet.addModule('src/audio-processor.js');
                    const source = audioContextRef.current.createMediaStreamSource(stream);
                    const workletNode = new AudioWorkletNode(audioContextRef.current, 'audio-processor', {
                        numberOfInputs: 1,
                        numberOfOutputs: 1,
                        processorOptions: {
                            sampleRate: WHISPER_SAMPLING_RATE
                        }
                    });

                    // Create initial 30 seconds of silence
                    const silenceDuration = 30; // seconds
                    const silenceSamples = silenceDuration * WHISPER_SAMPLING_RATE;
                    const initialSilence = new Float32Array(silenceSamples).fill(0);
                    
                    // Create custom recorder with initial silence
                    recorderRef.current = {
                        chunks: [initialSilence], // Start with 30 seconds of silence
                        state: 'inactive',
                        start: () => {
                            console.log('Recorder start called, current state:', {
                                state: recorderRef.current.state,
                                recording,
                                initialSilenceLength: initialSilence.length
                            });
                            recorderRef.current.state = 'recording';
                            source.connect(workletNode);
                            workletNode.connect(audioContextRef.current.destination);
                            setRecording(true);
                            // Initialize chunks with silence
                            setChunks([initialSilence]);
                            setSegments([]);
                            setText('');
                        },
                        stop: () => {
                            recorderRef.current.state = 'inactive';
                            source.disconnect(workletNode);
                            workletNode.disconnect();
                            setRecording(false);
                        }
                    };

                    // Handle raw PCM data from worklet
                    workletNode.port.onmessage = (event) => {
                        if (event.data.type === 'audio_data') {
                            const chunk = event.data.audioData;
                            setChunks(prev => [...prev, chunk]);
                        }
                    };

                    addLog('AudioWorklet setup complete for raw PCM recording');
                    
                    // Start recording
                    recorderRef.current.start();
                    
                } catch (error) {
                    addLog('Failed to setup AudioWorklet: ' + error.message, 'error');
                }
            })
            .catch(err => {
                addLog(`Media access error: ${err.message}`, 'error');
            });
    }

    return () => {
        if (recorderRef.current?.state === 'recording') {
            recorderRef.current.stop();
        }
        recorderRef.current = null;
    };
}, [status]);

  // Separate effect to handle recording state when model becomes ready
  useEffect(() => {
    if (status === 'ready' && recorderRef.current && recorderRef.current.state !== 'recording') {
        try {
            recorderRef.current.start(250);
            addLog('Started recording after model loaded');
        } catch (error) {
            addLog(`Failed to start recording: ${error.message}`, 'error');
        }
    }
}, [status]); // Only depend on status

  // Create addLog callback that uses the ref
  const addLog = useCallback((message, type = 'info') => {
    if (type === 'error') {
      console.error(message);
    } else {
      console.log(message);
    }
  }, []);

  // Store addLog in ref
  useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  // Initialize processor once
  useEffect(() => {
    if (!audioProcessorRef.current) {
        console.log("Creating AudioSegmentProcessor..."); // Direct debug

        // Create a logger function that both console.logs and uses addLog
        const logger = (message, data) => {
            console.log("AudioProcessor:", message, data); // Direct debug
            addLogRef.current?.(message, 'info');
        };

        audioProcessorRef.current = new AudioSegmentProcessor({
            logger: logger,  // Pass the enhanced logger
            sampleRate: WHISPER_SAMPLING_RATE,
            energyThreshold: audioThreshold,
            minSpeechDuration: 0.1,
            windowSize: 256,
            minSilenceBetween: silenceLength,
            speechHangover: speechHangover
        });

        // Test the logger immediately
        audioProcessorRef.current.log('Test message from initialization', {
            test: 'value'
        });

        addLog('AudioSegmentProcessor initialized', {
            threshold: audioThreshold,
            silenceLength,
            hangover: speechHangover
        });
    }
  }, []); // Empty dependency array - only run once

  // Add effect to update processor settings when controls change
  useEffect(() => {
    if (audioProcessorRef.current) {
        audioProcessorRef.current.options.energyThreshold = audioThreshold;
        audioProcessorRef.current.options.minSilenceBetween = silenceLength;
        audioProcessorRef.current.options.speechHangover = speechHangover;
        addLog('Updated processor settings', {
            threshold: audioThreshold,
            silenceLength,
            hangover: speechHangover
        });
    }
}, [audioThreshold, silenceLength, speechHangover]);

  // Handle reset button click
  const handleReset = useCallback(() => {
    addLog('Reset requested');
    if (recorderRef.current) {
      if (recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
      }
      audioManagerRef.current?.reset();
      
      setTimeout(() => {
        if (status === 'ready' && recorderRef.current) {
          try {
            recorderRef.current.start();
            addLog('Started new recording after reset');
          } catch (error) {
            addLog('Failed to start after reset: ' + error.message, 'error');
          }
        }
      }, 100);
    }
  }, [status]);

  // Separate effect for periodic processing
  useEffect(() => {
    if (status === 'ready' && recording) {
        addLog('Starting periodic buffer processing');
        let processingActive = true;
        let lastProcessedLength = 0;

        const processInterval = setInterval(() => {
            if (!audioProcessorRef.current || !audioBufferRef.current || !processingActive) {
                return;
            }

            try {
                const fullAudio = audioBufferRef.current;
                
                // Skip if no new audio data
                if (fullAudio.length === lastProcessedLength) {
                    return;
                }

                // Calculate processing window
                const samplesFor15Sec = 15 * WHISPER_SAMPLING_RATE;
                
                // Find start position based on last segment
                let startPos = 0;
                if (segments.length > 0) {
                    const lastSegment = segments[segments.length - 1];
                    startPos = Math.floor(lastSegment.endTime * WHISPER_SAMPLING_RATE);
                }

                // Get the relevant portion of audio
                const audioToProcess = fullAudio.slice(
                    Math.max(fullAudio.length - samplesFor15Sec, startPos),
                    fullAudio.length
                );

                if (audioToProcess.length > 0) {
                    // Process from the last segment's end time
                    const rawSegments = audioProcessorRef.current.processAudioData(
                        audioToProcess,
                        startPos / WHISPER_SAMPLING_RATE
                    );

                    // Convert raw segments to SpeechSegment objects
                    const newSegments = rawSegments.map(seg => new SpeechSegment(seg));

                    if (newSegments.length > 0) {
                        addLog('Created speech segments', {
                            count: newSegments.length,
                            segments: newSegments.map(s => ({
                                start: s.startTime.toFixed(2),
                                end: s.endTime.toFixed(2),
                                duration: s.getDuration().toFixed(2)
                            }))
                        });
                        setSegments(prev => [...prev, ...newSegments]);
                    }
                }

                // Update last processed length
                lastProcessedLength = fullAudio.length;

            } catch (error) {
                addLog('Error processing buffer: ' + error.message, 'error');
                console.error('Processing error:', error);
            }
        }, 500);

        return () => {
            processingActive = false;
            clearInterval(processInterval);
        };
    }
}, [status, recording, segments]); // Add segments to dependencies

  // Also verify that chunks are being added
  useEffect(() => {
      if (recorderRef.current) {
          recorderRef.current.ondataavailable = (e) => {
              if (e.data.size > 0) {
                  setChunks(prev => [...prev, e.data]);
              }
          };
      }
  }, []);

  // Add effect to update processor settings
  useEffect(() => {
    if (audioProcessorRef.current) {
        audioProcessorRef.current.options.maxSilenceWithinSpeech = maxSilenceWithinSpeech;
        addLog('Updated max silence within speech', {
            value: maxSilenceWithinSpeech
        });
    }
}, [maxSilenceWithinSpeech]);

  // Add effect to update processor settings
  useEffect(() => {
    if (audioProcessorRef.current) {
        audioProcessorRef.current.options.endingSpeechTolerance = endingSpeechTolerance;
        audioProcessorRef.current.options.endingEnergyThreshold = endingEnergyThreshold;
        addLog('Updated ending speech parameters', {
            tolerance: endingSpeechTolerance,
            threshold: endingEnergyThreshold
        });
    }
}, [endingSpeechTolerance, endingEnergyThreshold]);

  // Update AudioManager when parameters change
  useEffect(() => {
    if (audioProcessorRef.current) {
        audioProcessorRef.current.options = {
            ...audioProcessorRef.current.options,
            energyThreshold: audioThreshold,
            minSilenceBetween: silenceLength,
            speechHangover: speechHangover,
            energyScale: energyScale,
            hysteresisRatio: hysteresisRatio,
            minSpeechDuration: minSpeechDuration
        };
    }
  }, [audioThreshold, silenceLength, speechHangover, energyScale, hysteresisRatio, minSpeechDuration]);

  // In App.jsx, replace direct state with AudioManager
  useEffect(() => {
    const unsubscribe = audioManager.subscribe((event, data) => {
        switch(event) {
            case 'newSegment':
                setSegments(prev => [...prev, data]);
                break;
            case 'bufferUpdated':
                // Update visualizer etc
                break;
        }
    });

    return () => unsubscribe();
}, []);

  // Add cleanup effect
  useEffect(() => {
    return () => {
        // Cleanup audio connections
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    };
}, [stream]);

  return (
    <div className="flex flex-col h-screen w-screen mx-auto justify-start text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900">
      <div className="h-full w-full overflow-auto scrollbar-thin flex justify-start items-center flex-col relative pt-4">
        {/* Header */}
        <div className="flex flex-col items-center mb-1 max-w-[300px] text-center">
          <img src="logo.png" width="10%" height="auto" className="block" />
          <h1 className="text-xl font-bold mb-1">Whisper WebGPU</h1>
          <h2 className="text-base font-semibold">Real-time in-browser speech recognition</h2>
        </div>

        {/* Control Buttons - Moved to top */}
        <div className="flex gap-4 mb-4">
          {!recording && (
            <button
              className="border px-4 py-2 rounded-lg bg-blue-400 text-white hover:bg-blue-500"
              onClick={handleStartAudio}
            >
              Start Audio Capture
            </button>
          )}
          
          {status === 'initialized' && (
            <button
              className="border px-4 py-2 rounded-lg bg-blue-400 text-white hover:bg-blue-500 disabled:bg-blue-100 disabled:cursor-not-allowed select-none"
              onClick={() => {
                worker.current?.postMessage({ type: 'load' });
                setStatus('loading');
              }}
            >
              Load Whisper Model
            </button>
          )}
        </div>

        {/* Main content */}
        <div className="flex flex-col items-center w-full px-8">
          {/* Audio visualization and controls */}
          <div className="w-full max-w-[90vw] p-2">
            <AudioVisualizer 
              className="w-full rounded-lg" 
              stream={stream} 
              threshold={audioThreshold}
              onThresholdChange={setAudioThreshold}
              silenceLength={silenceLength}
              onSilenceLengthChange={setSilenceLength}
              speechHangover={speechHangover}
              onHangoverChange={setSpeechHangover}
              chunks={chunks}
              audioContextRef={audioContextRef}
              segments={segments}
              energyScale={energyScale}
              onEnergyScaleChange={setEnergyScale}
              hysteresisRatio={hysteresisRatio}
              onHysteresisChange={setHysteresisRatio}
              minSpeechDuration={minSpeechDuration}
              onMinSpeechDurationChange={setMinSpeechDuration}
            />

            {/* Loading progress */}
            {status === 'loading' && (
              <div className="w-full max-w-[500px] text-left mx-auto p-4">
                <p className="text-center">{loadingMessage}</p>
                {progressItems.map(({ file, progress, total }, i) => (
                  <Progress key={i} text={file} percentage={progress} total={total} />
                ))}
              </div>
            )}

            {/* Transcription output */}
            {status === 'ready' && (
              <div className="relative">
                <p className="w-full h-[160px] overflow-y-auto overflow-wrap-anywhere border rounded-lg p-2">
                  {text}
                </p>
                {tps && <span className="absolute bottom-0 right-0 px-1">{tps.toFixed(2)} tok/s</span>}
              </div>
            )}

            <StatsWidget 
              chunks={chunks} 
              audioContextRef={audioContextRef}
              segments={segments}
              threshold={audioThreshold}
            />

            {/* Language selection and reset */}
            {status === 'ready' && (
              <div className='relative w-full flex justify-center mt-4'>
                <select 
                  value={language} 
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
                <button 
                  className="border rounded-lg px-2 absolute right-2" 
                  onClick={handleReset}
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Speech Segments Widget - Moved to bottom */}
        <div className="w-full max-w-[90vw] p-2 mt-auto">
          <AudioSegmentsWidget segments={segments} />
        </div>
      </div>
    </div>
  );
}

export default App;
