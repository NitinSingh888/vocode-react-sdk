import { ConversationConfig, ConversationStatus, CurrentSpeaker, SelfHostedConversationConfig, Transcript } from "../types/conversation";
import { EventEmitter } from 'events';
export declare const useConversation: (config: ConversationConfig | SelfHostedConversationConfig) => {
    status: ConversationStatus;
    start: (assistantId: string) => void;
    stop: () => void;
    error: Error | undefined;
    active: boolean;
    setActive: (active: boolean) => void;
    toggleActive: () => void;
    analyserNode: AnalyserNode | undefined;
    transcripts: Transcript[];
    currentSpeaker: CurrentSpeaker;
    messageEmitter: EventEmitter;
};
