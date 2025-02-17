"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useConversation = void 0;
const extendable_media_recorder_1 = require("extendable-media-recorder");
const extendable_media_recorder_wav_encoder_1 = require("extendable-media-recorder-wav-encoder");
const react_1 = __importDefault(require("react"));
const utils_1 = require("../utils");
const react_device_detect_1 = require("react-device-detect");
const events_1 = require("events");
const VOCODE_API_URL = "api.vocode.dev";
const DEFAULT_CHUNK_SIZE = 2048;
const useConversation = (config) => {
    const [audioContext, setAudioContext] = react_1.default.useState();
    const [audioAnalyser, setAudioAnalyser] = react_1.default.useState();
    const [audioQueue, setAudioQueue] = react_1.default.useState([]);
    const [currentSpeaker, setCurrentSpeaker] = react_1.default.useState("none");
    const [processing, setProcessing] = react_1.default.useState(false);
    const [recorder, setRecorder] = react_1.default.useState();
    const [socket, setSocket] = react_1.default.useState();
    const [status, setStatus] = react_1.default.useState("idle");
    const [error, setError] = react_1.default.useState();
    const [transcripts, setTranscripts] = react_1.default.useState([]);
    const [active, setActive] = react_1.default.useState(true);
    const messageEmitter = new events_1.EventEmitter();
    let audioNodes = [];
    const toggleActive = () => setActive(!active);
    let nextPlayTime = 0;
    // get audio context and metadata about user audio
    react_1.default.useEffect(() => {
        const audioContext = new AudioContext();
        setAudioContext(audioContext);
        const audioAnalyser = audioContext.createAnalyser();
        setAudioAnalyser(audioAnalyser);
    }, []);
    const recordingDataListener = ({ data }) => {
        (0, utils_1.blobToBase64)(data).then((base64Encoded) => {
            if (!base64Encoded)
                return;
            const audioMessage = {
                type: "websocket_audio",
                data: base64Encoded,
            };
            (socket === null || socket === void 0 ? void 0 : socket.readyState) === WebSocket.OPEN &&
                socket.send((0, utils_1.stringify)(audioMessage));
        });
    };
    // once the conversation is connected, stream the microphone audio into the socket
    react_1.default.useEffect(() => {
        if (!recorder || !socket)
            return;
        if (status === "connected") {
            if (active)
                recorder.addEventListener("dataavailable", recordingDataListener);
            else
                recorder.removeEventListener("dataavailable", recordingDataListener);
        }
    }, [recorder, socket, status, active]);
    // accept wav audio from webpage
    react_1.default.useEffect(() => {
        const registerWav = () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, extendable_media_recorder_1.register)(yield (0, extendable_media_recorder_wav_encoder_1.connect)());
        });
        registerWav().catch(console.error);
    }, []);
    const stopConversation = (error) => {
        setAudioQueue([]);
        setCurrentSpeaker("none");
        if (error) {
            setError(error);
            setStatus("error");
        }
        else {
            setStatus("idle");
        }
        if (!recorder || !socket)
            return;
        recorder.stop();
        const stopMessage = {
            type: "websocket_stop",
        };
        socket.send((0, utils_1.stringify)(stopMessage));
        socket.close();
    };
    const getBackendUrl = () => __awaiter(void 0, void 0, void 0, function* () {
        if ("backendUrl" in config && config.backendUrl) {
            return config.backendUrl;
        }
        else if ("vocodeConfig" in config) {
            const baseUrl = config.vocodeConfig.baseUrl || VOCODE_API_URL;
            return `wss://${baseUrl}/conversation?key=${config.vocodeConfig.apiKey}`;
        }
        else if ("scalerLexiConfig" in config) {
            const baseUrl = config.scalerLexiConfig.baseUrl || '';
            return `wss://${baseUrl}/conversations/conversation?key=${config.scalerLexiConfig.apiKey}`;
        }
        else {
            throw new Error("Backend URL is unknown");
        }
    });
    const getStartMessage = (config, inputAudioMetadata, outputAudioMetadata, assistantId) => {
        let transcriberConfig = Object.assign(config.transcriberConfig, inputAudioMetadata);
        if (react_device_detect_1.isSafari && transcriberConfig.type === "transcriber_deepgram") {
            transcriberConfig.downsampling = 2;
        }
        return {
            type: "websocket_start",
            transcriberConfig: Object.assign(config.transcriberConfig, inputAudioMetadata),
            agentConfig: config.agentConfig,
            synthesizerConfig: Object.assign(config.synthesizerConfig, outputAudioMetadata),
            conversationId: config.vocodeConfig.conversationId,
            assistantId,
        };
    };
    const getAudioConfigStartMessage = (inputAudioMetadata, outputAudioMetadata, chunkSize, downsampling, conversationId, subscribeTranscript, assistantId) => ({
        type: "websocket_audio_config_start",
        inputAudioConfig: {
            samplingRate: inputAudioMetadata.samplingRate,
            audioEncoding: inputAudioMetadata.audioEncoding,
            chunkSize: chunkSize || DEFAULT_CHUNK_SIZE,
            downsampling,
        },
        outputAudioConfig: {
            samplingRate: outputAudioMetadata.samplingRate,
            audioEncoding: outputAudioMetadata.audioEncoding,
        },
        conversationId,
        subscribeTranscript,
        assistantId,
    });
    const startConversation = (assistantId) => __awaiter(void 0, void 0, void 0, function* () {
        if (!audioContext || !audioAnalyser)
            return;
        setStatus("connecting");
        if (!react_device_detect_1.isSafari && !react_device_detect_1.isChrome) {
            stopConversation(new Error("Unsupported browser"));
            return;
        }
        if (audioContext.state === "suspended") {
            audioContext.resume();
        }
        const backendUrl = yield getBackendUrl();
        if (backendUrl === "unknown") {
            throw new Error("Backend URL is unknown");
        }
        setError(undefined);
        const socket = new WebSocket(backendUrl);
        let error;
        socket.onerror = (event) => {
            console.error(event);
            error = new Error("See console for error details");
        };
        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            messageEmitter.emit("message", message);
            if (message.type === "websocket_audio") {
                // setAudioQueue((prev) => [...prev, Buffer.from(message.data, "base64")]);
                queueAudio(message.data);
            }
            else if (message.type === "websocket_ready") {
                setStatus("connected");
            }
            else if (message.type == "websocket_transcript") {
                setTranscripts((prev) => {
                    let last = prev.pop();
                    if (last && last.sender === message.sender) {
                        prev.push({
                            sender: message.sender,
                            text: last.text + " " + message.text,
                        });
                    }
                    else {
                        if (last) {
                            prev.push(last);
                        }
                        prev.push({
                            sender: message.sender,
                            text: message.text,
                        });
                    }
                    return prev;
                });
            }
            else if (message.type == "interrupt") {
                stopAudio();
            }
        };
        function stopAudio() {
            if (!audioContext)
                return;
            // Stop all scheduled audio nodes
            audioNodes.forEach(node => {
                try {
                    node.stop(); // Attempt to stop each node
                }
                catch (e) {
                    console.error("Error stopping audio node:", e);
                }
            });
            // Clear the array of audio nodes
            audioNodes = [];
            // Reset the nextPlayTime (if you want to reset scheduling)
            nextPlayTime = audioContext.currentTime;
        }
        function queueAudio(base64Audio) {
            const audioContext = new AudioContext();
            const audioData = atob(base64Audio); // Decode base64 to binary string
            const buffer = new Uint8Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
                buffer[i] = audioData.charCodeAt(i);
            }
            audioContext.decodeAudioData(buffer.buffer, (decodedData) => {
                scheduleAudioChunk(decodedData);
            }, (error) => {
                console.error('Error decoding audio data', error);
            });
        }
        function scheduleAudioChunk(audioBuffer) {
            if (!audioBuffer || !audioContext)
                return;
            const sourceNode = audioContext.createBufferSource();
            sourceNode.buffer = audioBuffer;
            sourceNode.connect(audioContext.destination);
            // If we're behind schedule, play immediately
            if (nextPlayTime < audioContext.currentTime) {
                nextPlayTime = audioContext.currentTime;
            }
            // Schedule the chunk to play at the appropriate time
            sourceNode.start(nextPlayTime);
            audioNodes.push(sourceNode);
            // Update the next play time by adding the current chunk's duration
            nextPlayTime += audioBuffer.duration;
            // Optional: Clean up when the chunk finishes playing
            sourceNode.onended = () => {
                // Optionally handle the end of the chunk if needed
            };
        }
        socket.onclose = (event) => {
            if (error) {
                stopConversation(error);
                return;
            }
            let err;
            if (event.code === 1000) {
                console.log("Connection closed gracefully.");
                setStatus("idle");
            }
            else if (event.code === 4000) {
                err = new Error(`Error: ${event.reason}`);
            }
            if (err) {
                setError(err);
                stopConversation(err);
            }
        };
        setSocket(socket);
        // wait for socket to be ready
        yield new Promise((resolve) => {
            const interval = setInterval(() => {
                if (socket.readyState === WebSocket.OPEN) {
                    clearInterval(interval);
                    resolve(null);
                }
            }, 100);
        });
        let audioStream;
        try {
            const trackConstraints = {
                echoCancellation: true,
            };
            if (config.audioDeviceConfig.inputDeviceId) {
                console.log("Using input device", config.audioDeviceConfig.inputDeviceId);
                trackConstraints.deviceId = config.audioDeviceConfig.inputDeviceId;
            }
            audioStream = yield navigator.mediaDevices.getUserMedia({
                video: false,
                audio: trackConstraints,
            });
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "NotAllowedError") {
                alert("Allowlist this site at chrome://settings/content/microphone to talk to the bot.");
                error = new Error("Microphone access denied");
            }
            console.error(error);
            stopConversation(error);
            return;
        }
        const micSettings = audioStream.getAudioTracks()[0].getSettings();
        console.log(micSettings);
        const inputAudioMetadata = {
            samplingRate: micSettings.sampleRate || audioContext.sampleRate,
            audioEncoding: "linear16",
        };
        console.log("Input audio metadata", inputAudioMetadata);
        const outputAudioMetadata = {
            samplingRate: config.audioDeviceConfig.outputSamplingRate || audioContext.sampleRate,
            audioEncoding: "linear16",
        };
        console.log("Output audio metadata", inputAudioMetadata);
        let startMessage;
        if ([
            "transcriberConfig",
            "agentConfig",
            "synthesizerConfig",
            "vocodeConfig",
        ].every((key) => key in config)) {
            startMessage = getStartMessage(config, inputAudioMetadata, outputAudioMetadata, assistantId);
        }
        else {
            const selfHostedConversationConfig = config;
            startMessage = getAudioConfigStartMessage(inputAudioMetadata, outputAudioMetadata, selfHostedConversationConfig.chunkSize, selfHostedConversationConfig.downsampling, selfHostedConversationConfig.conversationId, selfHostedConversationConfig.subscribeTranscript, assistantId);
        }
        socket.send((0, utils_1.stringify)(startMessage));
        console.log("Access to microphone granted");
        console.log(startMessage);
        let recorderToUse = recorder;
        if (recorderToUse && recorderToUse.state === "paused") {
            recorderToUse.resume();
        }
        else if (!recorderToUse) {
            recorderToUse = new extendable_media_recorder_1.MediaRecorder(audioStream, {
                mimeType: "audio/wav",
            });
            setRecorder(recorderToUse);
        }
        let timeSlice;
        if ("transcriberConfig" in startMessage) {
            timeSlice = Math.round((1000 * startMessage.transcriberConfig.chunkSize) /
                startMessage.transcriberConfig.samplingRate);
        }
        else if ("timeSlice" in config) {
            timeSlice = config.timeSlice;
        }
        else {
            timeSlice = 10;
        }
        if (recorderToUse.state === "recording") {
            // When the recorder is in the recording state, see:
            // https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/state
            // which is not expected to call `start()` according to:
            // https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/start.
            return;
        }
        recorderToUse.start(timeSlice);
    });
    return {
        status,
        start: startConversation,
        stop: stopConversation,
        error,
        toggleActive,
        active,
        setActive,
        analyserNode: audioAnalyser,
        transcripts,
        currentSpeaker,
        messageEmitter,
    };
};
exports.useConversation = useConversation;
