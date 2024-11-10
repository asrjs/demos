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
  const [audioThreshold, setAudioThreshold] = useState(0.05);
  const [silenceLength, setSilenceLength] = useState(0.3);

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

  useEffect(() => {
    if (recorderRef.current) return; // Already set

    if (navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          setStream(stream);
          addLog('Got media stream');

          audioContextRef.current = new AudioContext({ sampleRate: WHISPER_SAMPLING_RATE });
          recorderRef.current = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 16000,
            timeslice: 250  // Request data every 250ms
          });

          addLog('Created MediaRecorder');

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

          // Start recording if model is ready
          if (status === 'ready') {
            try {
              recorderRef.current.start(250);  // Start with timeslice
              addLog('Started recording on initialization');
            } catch (error) {
              addLog(`Failed to start recording: ${error.message}`, 'error');
            }
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
  }, [status]); // Keep status as dependency

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
        audioProcessorRef.current = new AudioSegmentProcessor({
            logger: (...args) => addLogRef.current?.(...args),
            sampleRate: WHISPER_SAMPLING_RATE,
            energyThreshold: 0.01,
            minSpeechDuration: 0.1
        });
        addLog('AudioSegmentProcessor initialized');
    }
  }, []); // Empty dependency array - only run once

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

  const [audioBuffer, setAudioBuffer] = useState(null);
  const processAudioRef = useRef({
      lastProcessedTime: 0,
      isProcessing: false
  });

  // Process audio chunks periodically
  useEffect(() => {
      if (status === 'ready' && recording) {
          const processInterval = setInterval(async () => {
              if (!chunks.length) return;

              try {
                  // Create audio buffer from chunks
                  const blob = new Blob(chunks, { type: recorderRef.current.mimeType });
                  const arrayBuffer = await blob.arrayBuffer();
                  const buffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
                  
                  // Store full buffer for visualization
                  setAudioBuffer(buffer);

                  // Get last 15 seconds for processing
                  const audio = buffer.getChannelData(0);
                  const windowSamples = 15 * WHISPER_SAMPLING_RATE;
                  const recentAudio = audio.length > windowSamples 
                      ? audio.slice(-windowSamples) 
                      : audio;

                  // Process for speech segments
                  if (!processAudioRef.current.isProcessing) {
                      const newSegments = audioProcessorRef.current
                          .processAudioData(recentAudio, processAudioRef.current.lastProcessedTime)
                          .map(segmentData => new SpeechSegment(segmentData));

                      if (newSegments.length > 0) {
                          addLog('Speech segments detected', {
                              count: newSegments.length,
                              segments: newSegments.map(s => ({
                                  start: s.startTime.toFixed(2),
                                  end: s.endTime.toFixed(2)
                              }))
                          });

                          setSegments(prev => [...prev, ...newSegments]);

                          // Process first unprocessed segment
                          const unprocessed = newSegments.find(s => !s.isProcessed);
                          if (unprocessed) {
                              processAudioRef.current.isProcessing = true;
                              worker.current.postMessage({
                                  type: 'generate',
                                  data: {
                                      audio: unprocessed.audioData,
                                      language,
                                      segmentId: segments.length + newSegments.indexOf(unprocessed)
                                  }
                              });
                          }
                      }
                  }

              } catch (error) {
                  addLog('Error processing audio: ' + error.message, 'error');
              }
          }, 500);

          return () => clearInterval(processInterval);
      }
  }, [status, recording, chunks]);

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
                  You are about to load <a href="https://huggingface.co/onnx-community/whisper-base" target="_blank" rel="noreferrer" className="font-medium underline">whisper-base</a>,
                  a 73 million parameter speech recognition model that is optimized for inference on the web. Once downloaded, the model (~200&nbsp;MB) will be cached and reused when you revisit the page.<br />
                  <br />
                  Everything runs directly in your browser using <a href="https://huggingface.co/docs/transformers.js" target="_blank" rel="noreferrer" className="underline">🤗&nbsp;Transformers.js</a> and ONNX Runtime Web,
                  meaning no data is sent to a server. You can even disconnect from the internet after the model has loaded!
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
