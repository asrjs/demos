// import { scan } from 'react-scan'; // import this BEFORE react

import { useEffect, useState, useRef, useCallback } from 'react';

import { AudioVisualizer } from './components/AudioVisualizer';
import Progress from './components/Progress';
import { SpeechSegment } from './SpeechSegment';
import { AudioSegmentProcessor } from './AudioSegmentProcessor';
import { AudioManager, audioManager } from './AudioManager';
import { AudioSegmentsWidget } from './components/AudioSegmentsWidget';
import { LanguageSelector } from './components/LanguageSelector';
import ModelLoader from './components/ModelLoader';
import models from './models';
import audioProcessorUrl from './audio-processor.js?url';

// scan({
//   enabled: true,
//   log: true, // logs render info to console (default: false)
//   clearLog: false, // clears the console per group of renders (default: false)
// });

const IS_WEBGPU_AVAILABLE = !!navigator.gpu;

const WHISPER_SAMPLING_RATE = 16_000;
const MAX_AUDIO_LENGTH = 30; // seconds
const MAX_SAMPLES = WHISPER_SAMPLING_RATE * MAX_AUDIO_LENGTH;

// Zaman sabitleri
const BASE_TIME_UNIT = 100; // milliseconds
const PROCESS_INTERVAL = 2 * BASE_TIME_UNIT;  // 200ms
const BUFFER_WINDOW = 15;   // 15 seconds

// Add this function at the top of App component
const disableAutogain = async (stream) => {
    try {
        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) {
            console.warn('No audio track found');
            return;
        }

        // Get audio constraints
        const constraints = audioTrack.getConstraints();
        console.log('Current constraints:', constraints);

        // Try to disable automatic gain control
        const newConstraints = {
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false,
            channelCount: 1,
            sampleRate: WHISPER_SAMPLING_RATE
        };

        // Apply new constraints
        await audioTrack.applyConstraints({
            advanced: [newConstraints]
        });

        // Verify the changes
        const finalConstraints = audioTrack.getConstraints();
        console.log('Automatically unsetting gain!', {
            audio: true,
            initial: constraints,
            applied: newConstraints,
            final: finalConstraints
        });

        // Get track settings to verify
        const settings = audioTrack.getSettings();
        console.log('Track settings after constraints:', settings);

    } catch (error) {
        console.warn('Failed to disable auto gain:', error);
    }
};

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

  // Model and processing state
  const [status, setStatus] = useState('initialized'); // Change default state
  const [loadingMessage, setLoadingMessage] = useState('');
  const [progressItems, setProgressItems] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recording, setRecording] = useState(false);

  // Audio parameters state
  const [audioThreshold, setAudioThreshold] = useState(0.125);
  const [silenceLength, setSilenceLength] = useState(0.6);    // 8 * BASE_TIME_UNIT
  const [speechHangover, setSpeechHangover] = useState(0.2);
  const [energyScale, setEnergyScale] = useState(2.0);
  const [hysteresisRatio, setHysteresisRatio] = useState(1.2);
  const [minSpeechDuration, setMinSpeechDuration] = useState(0.3); // 3 * BASE_TIME_UNIT
  const [maxSilenceWithinSpeech, setMaxSilenceWithinSpeech] = useState(0.3);
  const [endingSpeechTolerance, setEndingSpeechTolerance] = useState(0.4);
  const [endingEnergyThreshold, setEndingEnergyThreshold] = useState(0.6);

  // Audio data state
  const [stream, setStream] = useState(null);
  const [segments, setSegments] = useState([]);
  const [text, setText] = useState('');
  const [tps, setTps] = useState(null);
  const [language, setLanguage] = useState('en');

  // Add state for editable text
  const [editableText, setEditableText] = useState('');

  // Add new state for transcription tracking
  const [transcriptionHistory, setTranscriptionHistory] = useState([]);

  // Add state for energy integral threshold
  const [minEnergyIntegral, setMinEnergyIntegral] = useState(25);

  // Add model state
  const [selectedModel, setSelectedModel] = useState(Object.values(models)[0]);

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

  // Update handleStartAudio
  const handleStartAudio = async () => {
    try {
        await audioManager.startAudioContext();
        
        // Request audio with specific constraints
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                autoGainControl: false,
                echoCancellation: false,
                noiseSuppression: false,
                channelCount: 1,
                sampleRate: WHISPER_SAMPLING_RATE
            }
        });

        // Try to disable auto gain after getting stream
        await disableAutogain(stream);
        
        setStream(stream);
        
        // Load audio worklet module using the imported URL
        await audioManager.audioContext.audioWorklet.addModule(audioProcessorUrl);
        
        const source = audioManager.audioContext.createMediaStreamSource(stream);

        // Add gain control node
        const gainNode = audioManager.audioContext.createGain();
        gainNode.gain.value = 1.0; // Initial gain value

        const workletNode = new AudioWorkletNode(audioManager.audioContext, 'audio-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            processorOptions: {
                sampleRate: WHISPER_SAMPLING_RATE
            }
        });

        // Connect through gain node
        source.connect(gainNode);
        gainNode.connect(workletNode);

        workletNode.port.onmessage = (event) => {
            if (event.data.type === 'audio_data') {
                const chunk = event.data.audioData;
                const energy = event.data.energy;
                
                audioManager.processNewChunk(chunk, energy);
            }
        };

        workletNode.connect(audioManager.audioContext.destination);
        setRecording(true);

        // Store references for cleanup
        audioContextRef.current = audioManager.audioContext;

    } catch (error) {
        console.error('Failed to start audio:', error);
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

  // Update handleReset
  const handleReset = useCallback(() => {
    addLog('Reset requested');
    if (recorderRef.current) {
      if (recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
      }
      audioManager.reset();
      
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

  // Update cleanup effect
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      audioManager.reset();
    };
  }, [stream]);

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
            case 'segmentsUpdated':
                // Ensure all segment metadata is included
                setSegments(data.map(segment => ({
                    ...segment,
                    startTime: segment.startTime,
                    endTime: segment.endTime,
                    isMerged: segment.isMerged || false,
                    isPartOfMerged: segment.isPartOfMerged || false,
                    isProcessed: segment.isProcessed || false,
                    mergedId: segment.mergedId,
                    energy: segment.energy
                })));
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

  // Add debug display for transcription history (optional)
  const TranscriptionHistoryDebug = () => (
    <div className="mt-4 p-2 text-xs font-mono bg-gray-100 dark:bg-gray-800 rounded">
        <h4 className="font-bold">Transcription History:</h4>
        {transcriptionHistory.map((entry, i) => (
            <div key={i} className="ml-2">
                <span className={entry.isMerged ? 'text-purple-600' : 'text-blue-600'}>
                    {entry.id}
                </span>
                : {entry.text}
                {entry.isPartOfMerged && <span className="text-red-500"> (part of {entry.mergedId})</span>}
            </div>
        ))}
    </div>
  );

  // Add useEffect to handle transcription history updates
  useEffect(() => {
      // Update editable text whenever transcription history changes
      const validTranscriptions = transcriptionHistory
          .filter(entry => 
              // Keep if:
              // 1. It's a merged segment
              // 2. OR it's not part of any merged segment
              entry.isMerged || !entry.isPartOfMerged
          )
          .map(entry => entry.text);

      setEditableText(validTranscriptions.join('\n'));
  }, [transcriptionHistory]); // Depend on transcriptionHistory

  // Update parameters when changed
  useEffect(() => {
    audioManager.updateParameters({
        // ... existing parameters ...
        minEnergyIntegral
    });
  }, [minEnergyIntegral]);

  // Define a maximum number of chunks to store
  const MAX_CHUNKS = 1000; // Adjust as needed

  // Replace the chunks-based transcription effect with a new one that uses AudioManager
  useEffect(() => {
    if (!worker.current || !recording || isProcessing || status !== 'ready') return;

    const processInterval = setInterval(() => {
        // Get detected segments that haven't been processed yet
        const unprocessedSegments = audioManager.segments.filter(
            segment => !segment.isProcessed && !segment.isPartOfMerged
        );

        // Process each unprocessed segment
        unprocessedSegments.forEach(segment => {
            if (!segment.audioData) {
                console.warn('Segment has no audio data:', segment);
                return;
            }

            // Mark as processed to prevent duplicate processing
            segment.isProcessed = true;

            // Send to worker for transcription
            worker.current.postMessage({ 
                type: 'transcribe', 
                data: { 
                    audioData: segment.audioData,
                    language,
                    segmentId: segment.id,
                    isMerged: segment.isMerged
                } 
            });
        });
    }, 500); // Check every 500ms

    return () => clearInterval(processInterval);
}, [status, recording, isProcessing, language]);

  // Update the language selection handler to be less disruptive
  const handleLanguageChange = (newLanguage) => {
      console.log('Changing language from', language, 'to:', newLanguage);
      
      // Update language state
      setLanguage(newLanguage);
      
      // Update AudioManager with new language
      audioManager.updateLanguage(newLanguage);
      
      // No need to clear chunks or restart recording
      // Remove these lines:
      // setChunks([]);
      // if (recording) {
      //     if (recorderRef.current?.state === 'recording') {
      //         recorderRef.current.requestData();
      //     }
      // }
  };

  // Update the model change handler to be more specific
  const handleModelChange = (modelId) => {
      setSelectedModel(modelId);
      
      // If model ends with .en, automatically set language to English
      if (modelId.endsWith('.en')) {
          handleLanguageChange('en');
      }
  };

  // Ensure all intervals are cleared
  useEffect(() => {
      let processInterval = null;

      if (recording) {
          processInterval = setInterval(async () => {
              // ... existing processing code ...
          }, PROCESS_INTERVAL);
      }

      return () => {
          if (processInterval) clearInterval(processInterval);
      };
  }, [recording]); // Run only when recording state changes

  // Initialize worker and handle model loading
  useEffect(() => {
      if (!worker.current) {
          worker.current = new Worker(new URL('./worker.js', import.meta.url), {
              type: 'module'
          });

          // Pass worker to AudioManager
          audioManager.setWorker(worker.current);

          worker.current.addEventListener('message', (e) => {
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
                      break;

                  case 'start':
                      setIsProcessing(true);
                      break;

                  case 'update':
                      setTps(e.data.tps);
                      break;

                  case 'complete':
                      setIsProcessing(false);
                      const transcription = e.data.output;
                      const segmentId = e.data.segmentId;
                      const isMerged = e.data.segmentId.startsWith('merged_');
                      
                      // Debug log the incoming data
                      console.log('Received transcription data:', {
                          transcription,
                          segmentId,
                          hasWords: !!e.data.words,
                          wordCount: e.data.words?.length
                      });
                      
                      // Log word probabilities with formatting
                      if (e.data.words && e.data.words.length > 0) {
                          console.group('Transcription Details');
                          console.log('Full text:', transcription);
                          console.log('Words with probabilities:');
                          e.data.words.forEach(word => {
                              const confidence = (word.probability * 100).toFixed(2);
                              const confidenceColor = 
                                  word.probability > 0.9 ? 'color: green' :
                                  word.probability > 0.7 ? 'color: orange' : 
                                  'color: red';
                              console.log(`%c${word.text}: ${confidence}%`, confidenceColor);
                          });
                          console.groupEnd();
                      } else {
                          console.warn('No word probabilities received for segment:', segmentId);
                      }

                      // Update transcription history
                      setTranscriptionHistory(prev => {
                          const newEntry = {
                              id: segmentId,
                              text: transcription,
                              words: e.data.words, // Store word probabilities
                              timestamp: Date.now(),
                              isMerged,
                              containedSegments: isMerged ? 
                                  audioManager.segments.find(s => s.id === segmentId)?.originalSegments?.map(s => s.id) : 
                                  [],
                              isPartOfMerged: !isMerged && audioManager.segments.find(s => s.id === segmentId)?.isPartOfMerged,
                              mergedId: !isMerged ? audioManager.segments.find(s => s.id === segmentId)?.mergedId : null
                          };

                          const filteredHistory = prev.filter(entry => 
                              !newEntry.containedSegments?.includes(entry.id)
                          );

                          return [...filteredHistory, newEntry];
                      });

                      // Update AudioManager
                      audioManager.handleTranscriptionResult({
                          segmentId,
                          output: transcription,
                          words: e.data.words,
                          isMerged
                      });
                      break;
              }
          });

          return () => {
              worker.current.terminate();
              worker.current = null;
          };
      }
  }, []); // Empty dependency array - only run once on mount

  return (
    <div className="flex flex-col min-h-screen max-h-screen w-screen mx-auto text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900">
        {/* Compact Header */}
        <header className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b">
            <div className="flex items-center gap-2">
                <img src="logo.png" width="32" height="32" className="block" />
                <div>
                    <h1 className="text-lg font-bold">Whisper WebGPU</h1>
                    <h2 className="text-xs text-gray-600 dark:text-gray-400">Real-time speech recognition</h2>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                <LanguageSelector 
                    language={language}
                    setLanguage={handleLanguageChange}
                    disabled={selectedModel.endsWith('.en')}
                />
                
                {status === 'initialized' && (
                    <>
                        <ModelLoader 
                            onLoadModel={({ modelId, backend, quantization }) => {
                                worker.current?.postMessage({ 
                                    type: 'load',
                                    data: { 
                                        modelId,
                                        backend,
                                        quantization
                                    }
                                });
                                setStatus('loading');
                                // If model ends with .en, automatically set language to English
                                if (modelId.endsWith('.en')) {
                                    handleLanguageChange('en');
                                }
                            }}
                        />
                    </>
                )}
                
                {!recording && (
                    <button
                        className="px-3 py-1 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600"
                        onClick={handleStartAudio}
                    >
                        Start Recording
                    </button>
                )}
            </div>
        </header>

        {/* Main Content - Three Column Layout */}
        <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden">
            {/* Left Column - Audio Controls & Stats */}
            <div className="col-span-3 flex flex-col gap-4 overflow-y-auto">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <AudioVisualizer 
                        className="w-full" 
                        stream={stream} 
                        threshold={audioThreshold}
                        onThresholdChange={setAudioThreshold}
                        silenceLength={silenceLength}
                        onSilenceLengthChange={setSilenceLength}
                        speechHangover={speechHangover}
                        onHangoverChange={setSpeechHangover}
                        audioContextRef={audioContextRef}
                        segments={segments}
                        energyScale={energyScale}
                        onEnergyScaleChange={setEnergyScale}
                        hysteresisRatio={hysteresisRatio}
                        onHysteresisChange={setHysteresisRatio}
                        minSpeechDuration={minSpeechDuration}
                        onMinSpeechDurationChange={setMinSpeechDuration}
                        processor={audioManager.processor}
                        minEnergyIntegral={minEnergyIntegral}
                        onMinEnergyIntegralChange={setMinEnergyIntegral}
                    />
                </div>
            </div>

            {/* Middle Column - Transcription Output */}
            <div className="col-span-5 flex flex-col gap-4 overflow-hidden">
                {/* Loading Progress */}
                {status === 'loading' && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                        <p className="text-center mb-2">{loadingMessage}</p>
                        {progressItems.map(({ file, progress, total }, i) => (
                            <Progress key={i} text={file} percentage={progress} total={total} />
                        ))}
                    </div>
                )}

                {/* Transcription Text Area */}
                {status === 'ready' && (
                    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden">
                        <div className="flex-1 relative">
                            <textarea
                                value={editableText}
                                onChange={(e) => setEditableText(e.target.value)}
                                className="absolute inset-0 w-full h-full resize-none p-4 
                                         font-mono text-sm bg-white dark:bg-gray-800 
                                         border rounded-lg focus:ring-2 focus:ring-blue-500"
                                placeholder="Transcriptions will appear here..."
                            />
                        </div>
                        <div className="flex justify-end gap-2 p-2 bg-gray-100 dark:bg-gray-700">
                            {tps && (
                                <span className="px-2 py-1 text-sm bg-gray-200 dark:bg-gray-600 rounded">
                                    {tps.toFixed(2)} tok/s
                                </span>
                            )}
                            <button
                                onClick={() => setEditableText('')}
                                className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                            >
                                Clear
                            </button>
                            <button
                                onClick={() => navigator.clipboard.writeText(editableText)}
                                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                                Copy
                            </button>
                            <button 
                                onClick={handleReset}
                                className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Right Column - Segments List */}
            <div className="col-span-4 overflow-y-auto">
                <AudioSegmentsWidget 
                    segments={segments} 
                    worker={worker.current} 
                    language={language}
                />
            </div>
        </div>
    </div>
  );
}

export default App;
