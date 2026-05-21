import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Plus, 
  Trash2, 
  Sparkles, 
  Database, 
  HelpCircle, 
  Menu, 
  X, 
  Bot, 
  User, 
  RefreshCw, 
  ChevronRight, 
  Code2, 
  Globe, 
  Compass, 
  Check, 
  Eye, 
  AlertCircle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Message, ChatSession } from './types';
import { 
  isPuterAvailable, 
  getEnvironmentNotice, 
  getSessionsList, 
  saveSessionsList, 
  getSessionMessages, 
  saveSessionMessages, 
  deleteSessionPersistence, 
  askClaudeStream 
} from './puterService';
import { MarkdownRenderer } from './components/MarkdownRenderer';

export default function App() {
  // Session States
  const [sessions, setSessions] = useState<{ id: string; title: string; updatedAt: number }[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('default-nexus');
  const [messages, setMessages] = useState<Message[]>([]);
  
  // UI States
  const [inputValue, setInputValue] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationBuffer, setGenerationBuffer] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('claude-3-sonnet');
  const [customModelValue, setCustomModelValue] = useState<string>('');
  const [showCustomModelInput, setShowCustomModelInput] = useState<boolean>(false);
  
  // Environment Check State
  const [envNotice, setEnvNotice] = useState<{ isPuter: boolean; message: string; badge: string }>({
    isPuter: false,
    message: "Verificando conexión...",
    badge: "offline"
  });

  // Scroll element references
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize and check environment
  useEffect(() => {
    const checkEnv = () => {
      const notice = getEnvironmentNotice();
      setEnvNotice(notice);
    };

    // Run check immediately and also every 2 seconds in case Puter loads asynchronously
    checkEnv();
    const interval = setInterval(checkEnv, 2000);

    // Load session list
    const loadSessions = async () => {
      const list = await getSessionsList();
      setSessions(list);
      if (list.length > 0) {
        setCurrentSessionId(list[0].id);
      }
    };
    
    loadSessions();

    return () => clearInterval(interval);
  }, []);

  // Sync messages when active session changes
  useEffect(() => {
    const loadMessagesOfSession = async () => {
      const msgs = await getSessionMessages(currentSessionId);
      setMessages(msgs);
      setGenerationBuffer('');
    };
    loadMessagesOfSession();
  }, [currentSessionId]);

  // Scroll smoothly to bottom on new messages or during streams
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, generationBuffer]);

  // Handle textarea resize based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  // Create a brand new session/chat
  const handleCreateNewSession = async () => {
    const newId = `session-${Date.now()}`;
    const newSessionItem = {
      id: newId,
      title: "Nueva conversación — Claude API",
      updatedAt: Date.now()
    };

    const updatedSessions = [newSessionItem, ...sessions];
    setSessions(updatedSessions);
    await saveSessionsList(updatedSessions);
    setCurrentSessionId(newId);
    
    // Autofocus input
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  };

  // Delete a specific session
  const handleDeleteSession = async (idToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Filter out session
    const updatedSessions = sessions.filter(s => s.id !== idToDelete);
    setSessions(updatedSessions);
    await saveSessionsList(updatedSessions);
    await deleteSessionPersistence(idToDelete);

    // If active session was deleted, switch to another or construct a default
    if (currentSessionId === idToDelete) {
      if (updatedSessions.length > 0) {
        setCurrentSessionId(updatedSessions[0].id);
      } else {
        // Construct brand new default
        const defaultId = 'default-nexus';
        const defaultSession = {
          id: defaultId,
          title: "Nueva conversación con Nexus",
          updatedAt: Date.now()
        };
        setSessions([defaultSession]);
        await saveSessionsList([defaultSession]);
        setCurrentSessionId(defaultId);
      }
    }
  };

  // Submit a user query to Nexus & safely stream back results
  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = customPrompt || inputValue;
    if (!promptToSend.trim() || isGenerating) return;

    // Build user message
    const userMessage: Message = {
      id: `m-user-${Date.now()}`,
      role: 'user',
      content: promptToSend,
      timestamp: Date.now()
    };

    // Update messages UI immediately
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputValue('');
    setIsGenerating(true);
    setGenerationBuffer('');

    // Determine the active model
    const activeModel = showCustomModelInput ? (customModelValue || 'claude-3-sonnet') : selectedModel;

    // Auto update the conversation title if it was the default template
    const currentSession = sessions.find(s => s.id === currentSessionId);
    if (currentSession && (currentSession.title.startsWith("Nueva conversación") || currentSession.title.startsWith("Nueva sesio"))) {
      const summaryTitle = promptToSend.length > 25 ? promptToSend.substring(0, 25).trim() + "..." : promptToSend;
      const updatedList = sessions.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, title: summaryTitle, updatedAt: Date.now() };
        }
        return s;
      });
      setSessions(updatedList);
      await saveSessionsList(updatedList);
    } else if (currentSession) {
      // Just update timestamp
      const updatedList = sessions.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, updatedAt: Date.now() };
        }
        return s;
      });
      setSessions(updatedList);
      await saveSessionsList(updatedList);
    }

    try {
      // Format history context for service Call
      // (recuperado de puter.kv y pasado completo para mantener contexto)
      const formattedHistory = updatedMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Call streaming helper
      let finalText = "";
      const streamPromise = askClaudeStream(
        formattedHistory, 
        activeModel, 
        (chunk) => {
          setGenerationBuffer(prev => prev + chunk);
        }
      );

      finalText = await streamPromise;

      // Ensure we have a valid assistant message
      const assistantMessage: Message = {
        id: `m-asst-${Date.now()}`,
        role: 'assistant',
        content: finalText || "Hubo un problema al recopilar la respuesta. Por favor, asegúrate de haber configurado tu entorno.",
        timestamp: Date.now(),
        modelUsed: activeModel
      };

      // Save complete messages with persistence
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      await saveSessionMessages(currentSessionId, finalMessages);

    } catch (err: any) {
      console.error("Chat invocation failed:", err);
      const errorMessage: Message = {
        id: `m-err-${Date.now()}`,
        role: 'assistant',
        content: `**Error de Conexión:** No hemos podido procesar la llamada de Claude.\n\n_Detalles:_ ${err.message || 'Error Desconocido'}\n\nPor favor, verifica que tu entorno Puter.js se encuentre activo y tengas acceso a internet de alta velocidad.`,
        timestamp: Date.now()
      };
      const finalErrorMessages = [...updatedMessages, errorMessage];
      setMessages(finalErrorMessages);
      await saveSessionMessages(currentSessionId, finalErrorMessages);
    } finally {
      setIsGenerating(false);
      setGenerationBuffer('');
      // Autofocus textarea
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  };

  // Keyboard shortcut support
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Quick suggestion templates
  const SUGGESTIONS = [
    {
      label: "Explicar concepto técnico",
      prompt: "Explícame cómo funciona la persistencia Kv (Key-Value) en puter.js con ejemplos prácticos paso a paso.",
      icon: HelpCircle
    },
    {
      label: "Escribir código eficiente",
      prompt: "Escribe una función de paginación eficiente en TypeScript que use una base de datos distribuida.",
      icon: Code2
    },
    {
      label: "Inspiración del chatbot",
      prompt: "¿Cuáles son las ventajas de usar la API de Claude mediante el middleware seguro de Puter.js en lugar de peticiones REST directas?",
      icon: Compass
    }
  ];

  return (
    <div className="flex h-screen bg-[#fbfaf7] text-slate-900 font-sans antialiased overflow-hidden">
      
      {/* Sidebar - Colección de Conversaciones Minimalista */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.aside
            id="sidebar-container"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            className="hidden md:flex flex-col h-full bg-[#f6f5f0] border-r border-[#e6e2da] flex-shrink-0 relative overflow-hidden"
          >
            {/* Cabecera de la Barra Lateral — Estilo Editorial */}
            <div className="p-6 border-b border-[#e6e2da] flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <h1 className="text-2xl font-serif font-semibold tracking-tight text-[#1e1d1b] leading-none">Nexus</h1>
                <span className="text-[9.5px] uppercase font-mono tracking-widest text-[#8a8175]">Modelo de Conversación</span>
              </div>
              <button 
                id="close-sidebar-btn"
                onClick={() => setIsSidebarOpen(false)}
                className="p-1 px-1.5 rounded-md hover:bg-[#edeae0] text-[#736a62] transition-colors"
                title="Contraer Barra Lateral"
              >
                <X size={16} />
              </button>
            </div>

            {/* Acción Principal: Nuevo Chat */}
            <div className="p-4">
              <button
                id="new-chat-btn"
                onClick={handleCreateNewSession}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white hover:bg-[#fafaf9] border border-[#d3cdc2] rounded-lg shadow-2xs font-serif font-medium text-xs text-[#2c2926] transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
              >
                <Plus size={14} className="text-[#c2765c]" />
                <span>Nueva conversación</span>
              </button>
            </div>

            {/* Listado de Sesiones Guardadas */}
            <div className="flex-1 overflow-y-auto px-3 space-y-1">
              <div className="px-3 py-1 text-[10px] font-semibold tracking-wider text-[#8a8175] font-mono uppercase mt-2">
                Historial de ideas
              </div>
              
              {sessions.length === 0 ? (
                <div className="p-4 text-xs text-center text-[#999285] font-serif italic">
                  No hay chats archivados
                </div>
              ) : (
                sessions.map(s => {
                  const isActive = s.id === currentSessionId;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setCurrentSessionId(s.id)}
                      className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                        isActive 
                        ? 'bg-[#eae6db] text-[#1e1d1b] font-medium border-l-2 border-[#c2765c]' 
                        : 'text-[#5c544d] hover:bg-[#edeae0]/70'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden mr-2">
                        <Compass size={13} className={isActive ? "text-[#c2765c]" : "text-[#999285]"} />
                        <span className="truncate font-serif">{s.title}</span>
                      </div>
                      
                      {/* Borrado Silencioso */}
                      <button
                        id={`delete-btn-${s.id}`}
                        onClick={(e) => handleDeleteSession(s.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/65 text-[#999285] hover:text-[#c24f4f] transition-all duration-150"
                        title="Eliminar Conversación"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Configuración de Modelos — Estilo Minimalista e Integrado */}
            <div className="p-5 bg-[#edeae0]/80 border-t border-[#e6e2da] space-y-3.5">
              <div className="flex items-center gap-2 justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#6e6355] font-semibold">Motor de IA</span>
                <span className="text-[9px] font-mono bg-[#dedad0] text-[#4d443a] py-0.5 px-2 rounded-full font-medium">
                  {showCustomModelInput ? "ID Personal" : "Estable"}
                </span>
              </div>

              {!showCustomModelInput ? (
                <div className="flex flex-col gap-1.5">
                  <select
                    id="model-selector"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full text-xs bg-white border border-[#cfc8b7] rounded px-2.5 py-1.5 font-serif text-[#2a2927] focus:ring-1 focus:ring-[#c2765c] font-medium focus:outline-none"
                  >
                    <option value="claude-3-sonnet">Claude 3 Sonnet (Recomendado)</option>
                    <option value="claude-3-opus">Claude 3 Opus (Razonamiento)</option>
                    <option value="claude-3-haiku">Claude 3 Haisu (Veloz)</option>
                    <option value="gpt-4o">GPT-4o Premium (Multitarea)</option>
                  </select>
                  <button
                    id="toggle-custom-model-btn"
                    onClick={() => setShowCustomModelInput(true)}
                    className="text-[9.5px] text-[#c2765c] hover:underline text-left mt-0.5 font-sans transition-colors cursor-pointer"
                  >
                    Usar identificador personalizado de Puter...
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <input
                    id="custom-model-input"
                    type="text"
                    value={customModelValue}
                    placeholder="claude-3-sonnet"
                    onChange={(e) => setCustomModelValue(e.target.value)}
                    className="w-full text-xs bg-white border border-[#cfc8b7] rounded px-2.5 py-1.5 font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#c2765c]"
                  />
                  <div className="flex items-center justify-between gap-1.5">
                    <button
                      id="save-custom-model"
                      onClick={() => setShowCustomModelInput(false)}
                      className="text-[9px] text-[#736a62] hover:underline font-sans font-medium cursor-pointer"
                    >
                      ← Lista oficial
                    </button>
                    <span className="text-[8.5px] text-[#8a8175] font-mono italic">Puter.js ID</span>
                  </div>
                </div>
              )}
            </div>

            {/* Firma e Indicador de Privacidad Sanos */}
            <div className="p-4 border-t border-[#e6e2da] bg-[#eae6db] flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${envNotice.isPuter ? 'bg-emerald-600 animate-pulse' : 'bg-[#c2765c]'}`} />
                <span className="text-[10px] font-mono tracking-wider text-[#6e6355] font-medium uppercase">
                  {envNotice.isPuter ? "Conectado" : "Simulador Local"}
                </span>
              </div>
              <p className="text-[9px] text-[#8a8175] font-serif leading-snug">
                {envNotice.isPuter 
                  ? "Sincronizado vía base de datos local y red segura." 
                  : "Ejecutando en modo local. La base de datos persistente se activará al desplegar."}
              </p>
              
              <div className="mt-1 pt-2 border-t border-[#dedad0] flex items-center justify-between text-[8.5px] text-[#999285] font-mono">
                <span>Colección Nexus</span>
                <span>nicolascav.music</span>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main view container */}
      <main className="flex-1 flex flex-col h-full bg-[#fbfaf7] overflow-hidden relative">
        
        {/* Barra de Navegación Superior — Minimalismo Puro */}
        <header className="h-[60px] flex items-center justify-between px-4 md:px-6 border-b border-[#e6e2da] bg-[#fbfaf7] z-10">
          <div className="flex items-center gap-3">
            {/* Control para expandir barra lateral */}
            {!isSidebarOpen && (
              <button
                id="open-sidebar-btn"
                onClick={() => setIsSidebarOpen(true)}
                className="p-1 px-1.5 rounded-md hover:bg-[#edeae0] text-[#736a62] transition-colors cursor-pointer"
                title="Mostrar Barra Lateral"
              >
                <Menu size={18} />
              </button>
            )}

            <div className="md:hidden flex items-center gap-1.5 select-none">
              <h2 className="font-serif font-semibold text-lg text-[#1e1d1b]">Nexus</h2>
            </div>

            {/* Identificador de modelo en serif */}
            <div className="hidden md:flex items-center gap-2 font-serif text-xs text-[#736a62]">
              <span>Modelo activo:</span>
              <span className="font-sans font-medium text-[#1e1d1b] tracking-tight bg-[#edeae0] px-2 py-0.5 rounded-md">
                {showCustomModelInput ? (customModelValue || 'claude-3-sonnet') : selectedModel}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Limpiar conversación actual */}
            <button
              id="clear-session-btn"
              onClick={async () => {
                if (window.confirm("¿Estás seguro de que deseas limpiar esta conversación? El historial guardado se eliminará.")) {
                  setMessages([]);
                  await saveSessionMessages(currentSessionId, []);
                }
              }}
              className="flex items-center gap-1 py-1 px-2.5 rounded-lg text-xs font-serif text-[#999285] hover:text-[#c24f4f] hover:bg-[#edeae0]/40 transition-all cursor-pointer"
              title="Limpiar mensajes"
            >
              <Trash2 size={13} />
              <span className="hidden sm:inline">Limpiar chat</span>
            </button>

            {/* Indicador sutil de sincronización */}
            <span className="text-[10px] font-mono text-[#8a8175] py-0.5 px-2 bg-[#eae6db]/60 border border-[#e6e2da] rounded-md flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-amber-600"></span>
              <span>Sincronizado</span>
            </span>
          </div>
        </header>

        {/* Contenedor Principal del Chat de Claude */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:p-8 space-y-6">
          <div className="max-w-2xl mx-auto">
            {messages.length === 0 && !isGenerating && !generationBuffer ? (
              // Dashboard de Bienvenida de Estilo Editorial
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-12 pb-8 space-y-10"
              >
                {/* Cabecera Editorial */}
                <div className="text-center space-y-4">
                  <h1 className="text-4xl md:text-5xl font-serif font-normal tracking-tight text-[#1e1d1b]">
                    Nexus
                  </h1>
                  <p className="text-[15.5px] md:text-[16.5px] text-[#5c544d] max-w-lg mx-auto font-serif leading-relaxed italic">
                    Un espacio de conversación minimalista para pensar, escribir y depurar ideas de forma clara y sensata.
                  </p>
                </div>

                {/* Preguntas Sugeridas — Estilo Tarjetas de Papel */}
                <div className="space-y-3 pt-6">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#8a8175] px-1 font-semibold block text-center">
                    Ideas de partida
                  </span>
                  <div className="flex flex-col gap-2">
                    {SUGGESTIONS.map((sug, i) => (
                      <button
                        key={i}
                        id={`sug-btn-${i}`}
                        onClick={() => {
                          setInputValue(sug.prompt);
                          textareaRef.current?.focus();
                        }}
                        className="w-full flex items-center justify-between text-left p-4 rounded-xl border border-[#e6e2da] bg-white hover:bg-[#fcfbf9] hover:border-[#c2765c]/40 transition-all text-xs md:text-sm group shadow-xs cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <sug.icon size={13} className="text-[#c2765c] flex-shrink-0" />
                          <span className="text-[#3c3935] font-serif font-medium">{sug.label}</span>
                        </div>
                        <ChevronRight size={13} className="text-[#999285] group-hover:text-[#c2765c] transform group-hover:translate-x-0.5 transition-all" />
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              // Burbujas y Contenido del Chat Histórico
              <div className="space-y-6">
                {messages.map((message) => {
                  const isUser = message.role === 'user';
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-4 p-4 md:p-5 rounded-xl border transition-colors ${
                        isUser 
                        ? 'bg-[#f5f2eb] border-[#e6e2da]' 
                        : 'bg-white border-[#e6e2da]/70 shadow-2xs'
                      }`}
                    >
                      {/* Avatar Minimalista Editorial */}
                      <div className={`w-7 h-7 rounded-sm flex-shrink-0 flex items-center justify-center text-xs font-serif ${
                        isUser 
                        ? 'bg-[#c2765c]/10 text-[#c2765c] font-medium' 
                        : 'bg-[#2a2927] text-white'
                      }`}>
                        {isUser ? 'U' : 'N'}
                      </div>

                      {/* Cuerpo del Mensaje */}
                      <div className="flex-1 space-y-1.5 overflow-hidden">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono tracking-wider font-semibold text-[#8a8175] uppercase">
                            {isUser ? 'Usuario' : 'Nexus'}
                          </span>
                          <span className="text-[9.5px] font-mono text-[#aba395]">
                            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        
                        {/* Renderizado de Texto Markdown */}
                        <div className="pt-0.5 select-text">
                          <MarkdownRenderer content={message.content} />
                        </div>

                        {/* Pie de Firma del Modelo Utilizado */}
                        {!isUser && message.modelUsed && (
                          <div className="mt-3 pt-2 border-t border-[#edeae0] flex items-center gap-1.5 text-[9px] font-mono text-[#999285]">
                            <span>Modelo de procesamiento:</span>
                            <span className="font-semibold text-[#5c544d] bg-[#edeae0] py-0.5 px-2 rounded-md border border-[#e6e2da]/40">{message.modelUsed}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}

                {/* Bloque Activo de Transmisión (Streaming de Respuestas) */}
                {isGenerating && generationBuffer && (
                  <motion.div
                    initial={{ opacity: 0.6 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-4 p-4 md:p-5 rounded-xl border bg-white border-[#e6e2da]/70 shadow-2xs"
                  >
                    <div className="w-7 h-7 rounded-sm flex-shrink-0 flex items-center justify-center bg-[#2a2927] text-white text-xs font-serif">
                      N
                    </div>
                    
                    <div className="flex-1 space-y-1.5 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono tracking-wider font-semibold text-[#c2765c] uppercase flex items-center gap-1.5">
                          <span>Nexus está escribiendo</span>
                          <span className="flex gap-0.5">
                            <span className="w-1 h-1 rounded-full bg-[#c2765c] animate-bounce delay-100"></span>
                            <span className="w-1 h-1 rounded-full bg-[#c2765c] animate-bounce delay-200"></span>
                            <span className="w-1 h-1 rounded-full bg-[#c2765c] animate-bounce delay-300"></span>
                          </span>
                        </span>
                        <span className="text-[9.5px] font-mono text-[#aba395] italic">Streaming...</span>
                      </div>
                      
                      <div className="pt-0.5">
                        <MarkdownRenderer content={generationBuffer} />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Animación Sutil de Espera Inicial */}
                {isGenerating && !generationBuffer && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-center py-4"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-serif text-[#8a8175] bg-[#eae6db]/40 border border-[#e6e2da] p-2.5 rounded-lg px-4">
                      <RefreshCw size={11} className="animate-spin text-[#c2765c]" />
                      <span>Iniciando canal seguro...</span>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Flotante para Enviar Mensajes */}
        <footer className="p-4 md:p-6 bg-gradient-to-t from-[#fbfaf7] via-[#fbfaf7] to-transparent">
          <div className="max-w-2xl mx-auto space-y-2">
            
            {/* Contenedor del Prompt Principal */}
            <div className="relative bg-white border border-[#e6e2da] hover:border-[#ccd3cc] rounded-xl shadow-xs focus-within:ring-2 focus-within:ring-[#c2765c]/10 focus-within:border-[#c2765c] transition-all duration-150 overflow-hidden">
              <textarea
                id="prompt-textarea"
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Pregúntale a Nexus algo o escribe instrucciones..."
                className="w-full pl-4 pr-12 py-3 bg-transparent border-0 text-[#2a2927] placeholder-[#a59a8c] outline-none font-serif text-sm md:text-base leading-relaxed tracking-normal resize-none overflow-y-auto block focus:ring-0 min-h-[44px]"
                disabled={isGenerating}
              />

              {/* Botones de acción */}
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                {inputValue.trim() && (
                  <button
                    id="clear-input-btn"
                    onClick={() => setInputValue('')}
                    className="p-1 px-1.5 text-slate-400 hover:text-[#c24f4f] rounded cursor-pointer"
                    title="Limpiar entrada"
                  >
                    <X size={14} />
                  </button>
                )}
                <button
                  id="send-msg-btn"
                  onClick={() => handleSendMessage()}
                  disabled={!inputValue.trim() || isGenerating}
                  className={`p-1.5 rounded-lg transition-transform ${
                    inputValue.trim() && !isGenerating
                    ? 'bg-[#c2765c] text-white hover:bg-[#b0654c] active:scale-95 cursor-pointer shadow-xs' 
                    : 'bg-[#edeae0] text-[#aba395] cursor-not-allowed'
                  }`}
                  title="Enviar"
                >
                  <Send size={13} />
                </button>
              </div>
            </div>

            {/* Créditos de Privacidad */}
            <div className="flex flex-wrap items-center justify-between px-1 text-[10px] text-[#8a8175] font-serif italic">
              <span className="flex items-center gap-1 font-sans">
                <Globe size={11} className="text-emerald-600 animate-pulse" />
                <span>Ejecutando en <b>{showCustomModelInput ? (customModelValue || 'identidad personalizada') : selectedModel}</b></span>
              </span>
              <span className="hidden sm:inline">Persistencia local cifrada. Privacidad protegida de fábrica.</span>
            </div>

          </div>
        </footer>

      </main>

    </div>
  );
}
