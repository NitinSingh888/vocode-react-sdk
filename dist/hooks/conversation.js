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
const buffer_1 = require("buffer");
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
    const toggleActive = () => setActive(!active);
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
    // play audio that is queued
    react_1.default.useEffect(() => {
        const playArrayBuffer = (arrayBuffer) => {
            audioContext &&
                audioAnalyser &&
                audioContext.decodeAudioData(arrayBuffer, (buffer) => {
                    const source = audioContext.createBufferSource();
                    source.buffer = buffer;
                    source.connect(audioContext.destination);
                    source.connect(audioAnalyser);
                    setCurrentSpeaker("agent");
                    source.start(0);
                    source.onended = () => {
                        if (audioQueue.length <= 0) {
                            setCurrentSpeaker("user");
                        }
                        setProcessing(false);
                    };
                });
        };
        if (!processing && audioQueue.length > 0) {
            setProcessing(true);
            const audio = audioQueue.shift();
            audio &&
                fetch(URL.createObjectURL(new Blob([audio])))
                    .then((response) => response.arrayBuffer())
                    .then(playArrayBuffer);
        }
    }, [audioQueue, processing]);
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
        if ("backendUrl" in config) {
            return config.backendUrl;
        }
        else if ("vocodeConfig" in config) {
            const baseUrl = config.vocodeConfig.baseUrl || VOCODE_API_URL;
            return `wss://${baseUrl}/conversation?key=${config.vocodeConfig.apiKey}`;
        }
        else {
            throw new Error("Invalid config");
        }
    });
    const getStartMessage = (config, inputAudioMetadata, outputAudioMetadata) => {
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
        };
    };
    const getAudioConfigStartMessage = (inputAudioMetadata, outputAudioMetadata, chunkSize, downsampling, conversationId, subscribeTranscript) => ({
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
    });
    const startConversation = () => __awaiter(void 0, void 0, void 0, function* () {
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
        setError(undefined);
        const socket = new WebSocket(backendUrl);
        let error;
        socket.onerror = (event) => {
            console.error(event);
            error = new Error("See console for error details");
        };
        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === "websocket_audio") {
                setAudioQueue((prev) => [...prev, buffer_1.Buffer.from(message.data, "base64")]);
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
        };
        socket.onclose = () => {
            stopConversation(error);
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
            startMessage = getStartMessage(config, inputAudioMetadata, outputAudioMetadata);
        }
        else {
            const selfHostedConversationConfig = config;
            startMessage = getAudioConfigStartMessage(inputAudioMetadata, outputAudioMetadata, selfHostedConversationConfig.chunkSize, selfHostedConversationConfig.downsampling, selfHostedConversationConfig.conversationId, selfHostedConversationConfig.subscribeTranscript);
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
    };
};
exports.useConversation = useConversation;
