import { Message, ChatSession } from './types';

/**
 * Checks if Puter SDK is successfully loaded on the window object
 */
export function isPuterAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.puter;
}

/**
 * Gets a friendly status message about Puter environment
 */
export function getEnvironmentNotice(): { isPuter: boolean; message: string; badge: string } {
  if (isPuterAvailable()) {
    return {
      isPuter: true,
      message: "Conectado al entorno seguro de Puter.js — Almacenamiento KV persistente y Claude API activos.",
      badge: "Puter Online"
    };
  } else {
    return {
      isPuter: false,
      message: "Ejecutando en previsualización de AI Studio. Usando almacenamiento local (localStorage) como fallback.",
      badge: "Modo Local"
    };
  }
}

/**
 * Loads list of all chat sessions
 */
export async function getSessionsList(): Promise<{ id: string; title: string; updatedAt: number }[]> {
  const DEFAULT_SESSIONS = [
    {
      id: "default-nexus",
      title: "Nueva conversación con Nexus",
      updatedAt: Date.now()
    }
  ];

  if (isPuterAvailable()) {
    try {
      const list = await window.puter.kv.get('nexus_sessions_list');
      if (list) {
        return typeof list === 'string' ? JSON.parse(list) : list;
      }
    } catch (e) {
      console.error("Failed to load sessions from Puter KV:", e);
    }
  } else {
    const local = localStorage.getItem('nexus_sessions_list');
    if (local) {
      try {
        return JSON.parse(local);
      } catch (_) {}
    }
  }
  return DEFAULT_SESSIONS;
}

/**
 * Saves list of chat sessions
 */
export async function saveSessionsList(sessions: { id: string; title: string; updatedAt: number }[]): Promise<void> {
  if (isPuterAvailable()) {
    try {
      await window.puter.kv.set('nexus_sessions_list', JSON.stringify(sessions));
    } catch (e) {
      console.error("Failed to save sessions list to Puter KV:", e);
    }
  } else {
    localStorage.setItem('nexus_sessions_list', JSON.stringify(sessions));
  }
}

/**
 * Loads messages for a specific session ID
 */
export async function getSessionMessages(sessionId: string): Promise<Message[]> {
  const WELCOME_MESSAGES: Message[] = [
    {
      id: "welcome-msg",
      role: 'assistant',
      content: "Hola. Soy Nexus. Un modelo conversacional minimalista integrado en el entorno seguro de **Puter.js**. \n\n¿En qué puedo asistirte hoy?",
      timestamp: Date.now()
    }
  ];

  if (isPuterAvailable()) {
    try {
      const data = await window.puter.kv.get(`nexus_session_msgs_${sessionId}`);
      if (data) {
        return typeof data === 'string' ? JSON.parse(data) : data;
      }
    } catch (e) {
      console.error(`Failed to load messages for session ${sessionId} from Puter KV:`, e);
    }
  } else {
    const local = localStorage.getItem(`nexus_session_msgs_${sessionId}`);
    if (local) {
      try {
        return JSON.parse(local);
      } catch (_) {}
    }
  }
  return WELCOME_MESSAGES;
}

/**
 * Saves messages for a specific session ID
 */
export async function saveSessionMessages(sessionId: string, messages: Message[]): Promise<void> {
  if (isPuterAvailable()) {
    try {
      await window.puter.kv.set(`nexus_session_msgs_${sessionId}`, JSON.stringify(messages));
    } catch (e) {
      console.error(`Failed to save messages for session ${sessionId} to Puter KV:`, e);
    }
  } else {
    localStorage.setItem(`nexus_session_msgs_${sessionId}`, JSON.stringify(messages));
  }
}

/**
 * Deletes a session from persistence
 */
export async function deleteSessionPersistence(sessionId: string): Promise<void> {
  if (isPuterAvailable()) {
    try {
      // Puter KV set to null or delete
      await window.puter.kv.set(`nexus_session_msgs_${sessionId}`, null);
    } catch (e) {
      console.error(`Failed to delete session messages from Puter KV:`, e);
    }
  } else {
    localStorage.removeItem(`nexus_session_msgs_${sessionId}`);
  }
}

/**
 * Calls Puter AI Chat to stream or fetch Claude completion
 */
export async function askClaudeStream(
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  model: string = 'claude-3-sonnet',
  onChunk: (chunk: string) => void
): Promise<string> {
  
  const systemPrompt = "Eres 'Nexus', un asistente de IA con una personalidad minimalista, sumamente inteligente y clara, inspirada en Claude de Anthropic. Respondes en formato Markdown elegante, con alta sensatez y de manera sumamente estructurada.";
  
  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content }))
  ];

  // Map model inputs dynamically to prevent Puter bad_request errors
  let activeModel = model;
  if (activeModel.includes('3-5-sonnet') || activeModel.includes('3.5-sonnet')) {
    activeModel = 'claude-3-sonnet'; // Map to Puter's verified Claude 3 Sonnet ID
  }

  if (isPuterAvailable()) {
    try {
      // Puter's AI chat streaming
      const responseStream = await window.puter.ai.chat(formattedMessages, {
        model: activeModel,
        stream: true
      });

      let fullText = "";
      for await (const chunk of responseStream) {
        let text = "";
        if (typeof chunk === 'string') {
          text = chunk;
        } else if (chunk && typeof chunk === 'object') {
          // Check standard puter string/chunk structures
          text = chunk.text || chunk.content || (chunk.message && chunk.message.content) || "";
        }
        if (text) {
          fullText += text;
          onChunk(text);
        }
      }
      return fullText;
    } catch (error: any) {
      console.warn("Error streaming with model " + activeModel + ", retrying with Puter's default model:", error);
      
      try {
        // ULTIMATE FALLBACK: Call without a specified model parameter to let Puter assign standard default (gpt-4o/Claude)
        const responseStream = await window.puter.ai.chat(formattedMessages, {
          stream: true
        });

        let fullText = "";
        for await (const chunk of responseStream) {
          let text = "";
          if (typeof chunk === 'string') {
            text = chunk;
          } else if (chunk && typeof chunk === 'object') {
            text = chunk.text || chunk.content || (chunk.message && chunk.message.content) || "";
          }
          if (text) {
            fullText += text;
            onChunk(text);
          }
        }
        return fullText;
      } catch (fallbackError) {
        console.error("Default model streaming failed too, using non-stream fallback:", fallbackError);
        
        // Fallback to standard non-streaming call if stream fails
        const response = await window.puter.ai.chat(formattedMessages, {
          stream: false
        });

        let textResult = "";
        if (typeof response === "string") {
          textResult = response;
        } else if (response && typeof response === 'object') {
          textResult = response.text || response.content || (response.message && (typeof response.message === 'string' ? response.message : response.message.content)) || "";
        }
        onChunk(textResult);
        return textResult;
      }
    }
  } else {
    // If running outside puter's live container sandbox (standard preview fallbacks)
    return simulateStreamCompletion(messages, onChunk);
  }
}

/**
 * Simulates streaming completion with high quality Claude mock output
 * so that developers can preview and play with the applet cleanly outside the sandbox.
 */
async function simulateStreamCompletion(
  messages: { role: string; content: string }[],
  onChunk: (chunk: string) => void
): Promise<string> {
  const lastMessage = messages[messages.length - 1]?.content || "";
  
  let reply = "";
  if (lastMessage.toLowerCase().includes("hola") || lastMessage.toLowerCase().includes("hello")) {
    reply = "¡Hola! He recibido tu mensaje. Actualmente estamos ejecutando en la previsualización local del entorno de desarrollo. \n\nPara interactuar con la **API real de Claude**, asegúrate de ejecutar esta app dentro de la plataforma **Puter.js**, donde las credenciales seguras y el almacenamiento de bases de datos se enlazan automáticamente. \n\n¿En qué puedo ayudarte a diseñar hoy?";
  } else if (lastMessage.toLowerCase().includes("puter")) {
    reply = "¡Sí! **Puter.js** es un entorno espectacular para desarrolladores. Ofrece:\n\n1. **APIs Sin Claves expuestas**: Te permite usar modelos de lenguaje como Claude (`claude-3-5-sonnet`) sin revelar tu token de Anthropic en el frontend.\n2. **Persistencia Simplificada**: Accedes a base de datos de clave-valor instantáneas usando `puter.kv.set` y `puter.kv.get`.\n3. **Alojamiento Seguro**: Tu aplicación corre en contenedores protegidos.\n\nEste clon minimalista de Claude aprovecha todas estas capacidades de manera nativa.";
  } else {
    reply = `Has dicho: "${lastMessage}".\n\nEste es un simulador de respuesta de **Nexus Chatbot**. Como estamos en el modo de desarrollo de AI Studio fuera del contenedor en la nube de Puter, te ofrezco esta respuesta estructurada:\n\n* **Alineación**: Estilo visual impecable y minimalista.\n* **Capacidad**: Renderizado completo de Markdown, bloques de código, tablas y citas.\n* **Próximo Paso**: Despliega esta aplicación en Puter para conectar el flujo de datos directos. Puedes guardar conversaciones pulsando el botón de historial en la barra lateral.`;
  }

  // Stagger delivery to simulate actual streaming experience perfectly
  const words = reply.split(" ");
  let accumulated = "";
  for (const word of words) {
    await new Promise(r => setTimeout(r, 40 + Math.random() * 30));
    const append = word + " ";
    accumulated += append;
    onChunk(append);
  }
  return accumulated;
}
