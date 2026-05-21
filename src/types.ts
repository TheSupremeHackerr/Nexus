/**
 * Types and interfaces for Nexus Chatbot
 */

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  modelUsed?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface ModelOption {
  id: string;
  name: string;
  provider: 'Anthropic' | 'OpenAI' | 'Google' | 'Meta';
  description: string;
}

// Global declaration for Puter SDK loaded via script tag
declare global {
  interface Window {
    puter?: any;
  }
}
