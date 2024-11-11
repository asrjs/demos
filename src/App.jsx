import { useEffect, useState, useRef, useCallback } from 'react';

import { AudioVisualizer } from './components/AudioVisualizer';
import Progress from './components/Progress';
import { StatsWidget } from './components/StatsWidget';
import { SpeechSegment } from './SpeechSegment';
import { AudioSegmentProcessor } from './AudioSegmentProcessor';
import { DebugLog } from './components/DebugLog';

const IS_WEBGPU_AVAILABLE = !!navigator.gpu;

const WHISPER_SAMPLING_RATE = 16_000;
const MAX_AUDIO_LENGTH = 30; // seconds
const MAX_SAMPLES = WHISPER_SAMPLING_RATE * MAX_AUDIO_LENGTH;

const LANGUAGES = [
    { value: 'tr', label: 'Turkish' },
    { value: 'en', label: 'English' }
];

const PROCESS_INTERVAL = 500;  // Process every 500ms
const BUFFER_WINDOW = 15;      // Keep last 15 seconds for processing

function App() {

  // Create a reference to the worker object.
  const worker = useRef(null);

  const recorderRef = useRef(null);

  // Model loading and progress
  const [status, setStatus] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [progressItems, setProgressItems] = useState([]);

  // Inputs and outputs
  const [text, setText] = useState('');
  const [tps, setTps] = useState(null);
  const [language, setLanguage] = useState('tr');

  // Processing
  const [recording, setRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chunks, setChunks] = useState([]);
  const [stream, setStream] = useState(null);
  const audioContextRef = useRef(null);

  // Add audioThreshold state
  const [audioThreshold, setAudioThreshold] = useState(0.02);
  const [silenceLength, setSilenceLength] = useState(0.3);
  const [speechHangover, setSpeechHangover] = useState(0.2);

  // Add segments state
  const [segments, setSegments] = useState([]);
  const lastProcessedTimeRef = useRef(0);

  // Add reference for the last processed time
  const lastProcessTimeRef = useRef(0);
  const processingIntervalRef = useRef(null);

  // Initialize refs at the top
  const audioProcessorRef = useRef(null);
  const addLogRef = useRef(null);

  // Add TranscriptionManager reference
  const transcriptionManagerRef = useRef(null);

  // Replace separate refs with AudioManager
  const audioManagerRef = useRef(null);

  // Add debugLogs state
  const [debugLogs, setDebugLogs] = useState([]);

  // Change audioBuffer from state to ref
  const audioBufferRef = useRef(null);  // Replace useState with useRef

  // Add state for maxSilenceWithinSpeech
  const [maxSilenceWithinSpeech, setMaxSilenceWithinSpeech] = useState(0.3);

  // Add new state variables
  const [endingSpeechTolerance, setEndingSpeechTolerance] = useState(0.4);
  const [endingEnergyThreshold, setEndingEnergyThreshold] = useState(0.6);

  // Initialize AudioManager
  useEffect(() => {
    if (!worker.current || audioManagerRef.current) return;

    // Create AudioSegmentProcessor first
    const audioProcessor = new AudioSegmentProcessor({
        logger: addLog,  // Pass addLog directly
        sampleRate: WHISPER_SAMPLING_RATE,
        energyThreshold: 0.01,
        minSpeechDuration: 0.1
    });

    // Create AudioManager with the processor
    audioManagerRef.current = new AudioManager(worker.current, {
        sampleRate: WHISPER_SAMPLING_RATE,
        logger: addLog,
        audioProcessor: audioProcessor  // Pass the processor instance
    });

    audioManagerRef.current.setCallbacks({
        onSegmentsUpdate: (segments) => {
            addLog('Segments updated:', {
                count: segments.length,
                latest: segments[segments.length - 1]
            });
            setSegments(segments);
        },
        onTranscriptionUpdate: (text) => setText(prev => prev + ' ' + text),
        onProcessingStateChange: (isProcessing) => setIsProcessing(isProcessing)
    });

    addLog('AudioManager initialized with processor');
  }, []);

  // Update controls
  useEffect(() => {
    if (audioManagerRef.current) {
        audioManagerRef.current.setThreshold(audioThreshold);
        audioManagerRef.current.setSilenceLength(silenceLength);
    }
  }, [audioThreshold, silenceLength]);

  // Process buffer periodically
  useEffect(() => {
    if (status === 'ready' && recording) {
        const processInterval = setInterval(async () => {
            if (!chunks.length) {
                addLog('No chunks available');
                return;
            }

            try {
                const blob = new Blob(chunks, { type: recorderRef.current.mimeType });
                const arrayBuffer = await blob.arrayBuffer();
                const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
                
                addLog('Processing buffer', { 
                    duration: audioBuffer.duration.toFixed(2) + 's',
                    sampleRate: audioBuffer.sampleRate,
                    chunks: chunks.length,
                    isProcessing
                });

                await audioManagerRef.current?.processAudioBuffer(audioBuffer);

            } catch (error) {
                addLog('Error processing buffer: ' + error.message, 'error');
            }
        }, PROCESS_INTERVAL);

        return () => clearInterval(processInterval);
    }
}, [status, recording, chunks]);

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
                
                // Try to use uncompressed format if supported
                let mimeType = 'audio/wav';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'audio/webm;codecs=pcm';
                }
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'audio/webm;codecs=opus';
                }

                addLog('Using audio format:', { mimeType });
                
                recorderRef.current = new MediaRecorder(stream, {
                    mimeType: mimeType,
                    audioBitsPerSecond: 16000
                });

                try {
                    // Load and register the audio worklet
                    await audioContextRef.current.audioWorklet.addModule('src/audio-processor.js');
                    
                    // Create audio worklet node
                    const source = audioContextRef.current.createMediaStreamSource(stream);
                    const workletNode = new AudioWorkletNode(audioContextRef.current, 'audio-processor', {
                        numberOfInputs: 1,
                        numberOfOutputs: 1,
                        processorOptions: {
                            sampleRate: WHISPER_SAMPLING_RATE
                        }
                    });

                    // Handle messages from the audio worklet
                    workletNode.port.onmessage = (event) => {
                        if (event.data.type === 'audio_data') {
                            const inputData = event.data.audioData;
                            // Store raw PCM data directly in ref
                            if (!audioBufferRef.current) {
                                audioBufferRef.current = inputData;
                            } else {
                                const newBuffer = new Float32Array(audioBufferRef.current.length + inputData.length);
                                newBuffer.set(audioBufferRef.current);
                                newBuffer.set(inputData, audioBufferRef.current.length);
                                audioBufferRef.current = newBuffer;
                            }
                        }
                    };

                    // Connect the audio nodes
                    source.connect(workletNode);
                    workletNode.connect(audioContextRef.current.destination);
                    
                    addLog('Audio worklet setup complete');
                } catch (error) {
                    addLog('Failed to setup audio worklet: ' + error.message, 'error');
                    console.error('Audio worklet setup error:', error);
                }

                // Set up MediaRecorder event handlers
                recorderRef.current.onstart = () => {
                    addLog('MediaRecorder started');
                    setRecording(true);
                    setChunks([]);
                    lastProcessTimeRef.current = 0;
                    setSegments([]);
                    setText('');
                };

                recorderRef.current.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        setChunks(prev => [...prev, e.data]);
                    }
                };

                recorderRef.current.onstop = () => {
                    addLog('MediaRecorder stopped');
                    setRecording(false);
                };

                // Start recording immediately
                try {
                    recorderRef.current.start(250);
                    addLog('Started recording');
                } catch (error) {
                    addLog(`Failed to start recording: ${error.message}`, 'error');
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
    setDebugLogs(prev => [...prev, {
      timestamp: Date.now(),
      message: typeof message === 'object' ? JSON.stringify(message, null, 2) : message,
      type
    }]);
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

  // Clear logs handler
  useEffect(() => {
    const handleClearLogs = () => setDebugLogs([]);
    window.addEventListener('clearDebugLogs', handleClearLogs);
    return () => window.removeEventListener('clearDebugLogs', handleClearLogs);
  }, []);

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
              console.log("🎵 New audio chunk:", {
                  size: e.data.size,
                  type: e.data.type
              });
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

  return (
    IS_WEBGPU_AVAILABLE
      ? (<div className="flex flex-col h-screen w-screen mx-auto justify-start text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900">
        {(
          <div className="h-full w-full overflow-auto scrollbar-thin flex justify-start items-center flex-col relative pt-4">
            <div className="flex flex-col items-center mb-1 max-w-[300px] text-center">
              <img src="logo.png" width="10%" height="auto" className="block"></img>
              <h1 className="text-xl font-bold mb-1">Whisper WebGPU</h1>
              <h2 className="text-base font-semibold">Real-time in-browser speech recognition</h2>
            </div>

            <div className="flex flex-col items-center w-full px-8">
              {status === null && (<>
                <p className="max-w-[480px] mb-4">
                  <br />
                  You are about to load <a href="https://huggingface.co/onnx-community/whisper-base" target="_blank" rel="noreferrer" className="font-medium underline">whisper-base</a>
                </p>

                <button
                  className="border px-4 py-2 rounded-lg bg-blue-400 text-white hover:bg-blue-500 disabled:bg-blue-100 disabled:cursor-not-allowed select-none"
                  onClick={() => {
                    worker.current.postMessage({ type: 'load' });
                    setStatus('loading');
                  }}
                  disabled={status !== null}
                >
                  Load model
                </button>
              </>)}

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
                />
                {status === 'ready' && <div className="relative">
                  <p className="w-full h-[160px] overflow-y-auto overflow-wrap-anywhere border rounded-lg p-2">{text}</p>
                  {tps && <span className="absolute bottom-0 right-0 px-1">{tps.toFixed(2)} tok/s</span>}
                </div>}

                {status === 'ready' && 
                    <StatsWidget 
                        chunks={chunks} 
                        audioContextRef={audioContextRef}
                        segments={segments}
                        threshold={audioThreshold}
                    />
                }
                <DebugLog logs={debugLogs} />
              </div>

              {status === 'ready' && <div className='relative w-full flex justify-center'>
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
                <button className="border rounded-lg px-2 absolute right-2" onClick={handleReset}>
                    Reset
                </button>
              </div>
              }

              {status === 'loading' && (
                <div className="w-full max-w-[500px] text-left mx-auto p-4">
                  <p className="text-center">{loadingMessage}</p>
                  {progressItems.map(({ file, progress, total }, i) => (
                    <Progress key={i} text={file} percentage={progress} total={total} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>)
      : (<div className="fixed w-screen h-screen bg-black z-10 bg-opacity-[92%] text-white text-2xl font-semibold flex justify-center items-center text-center">WebGPU is not supported<br />by this browser :&#40;</div>)
  )
}

export default App
