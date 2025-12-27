import React, { useState, useEffect, useRef } from 'react'
import './App.css'

const App = () => {
  const [currentPath, setCurrentPath] = useState('/Users/Pc/repos/homelab')
  const [currentProvider, setCurrentProvider] = useState('opencode')
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const paths = [
    { value: '/Users/Pc/repos/homelab', label: '📁 homelab' },
    { value: '/Users/Pc/repos', label: '📁 repos' },
    { value: '/Users/Pc', label: '📁 Pc' },
    { value: '/Users/Pc/repos/kod', label: '📁 kod' }
  ]

  const providers = [
    { value: 'claude', label: '🤖 Claude Code' },
    { value: 'opencode', label: '🔧 opencode' }
  ]

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    // Add welcome message
    setMessages([{
      id: Date.now(),
      role: 'system',
      content: 'Welcome to Koder! Select a path, choose your AI provider, and start coding.'
    }])
  }, [])

  const sendMessage = async () => {
    const message = inputMessage.trim()
    if (!message) return

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: message
    }

    setMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          path: currentPath,
          sessionId,
          provider: currentProvider
        })
      })

      const data = await response.json()
      
      if (data.sessionId) {
        setSessionId(data.sessionId)
      }

      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.response,
        provider: data.provider
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: `Error: ${error.message}`
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handlePathChange = (e) => {
    setCurrentPath(e.target.value)
    setMessages(prev => [...prev, {
      id: Date.now(),
      role: 'system',
      content: `Switched to: ${e.target.value}`
    }])
  }

  const handleProviderChange = (e) => {
    const newProvider = e.target.value
    setCurrentProvider(newProvider)
    setSessionId(null) // Reset session when switching providers
    setMessages(prev => [...prev, {
      id: Date.now(),
      role: 'system',
      content: `Switched to: ${newProvider === 'claude' ? 'Claude Code' : 'opencode'}`
    }])
  }

  const formatContent = (content) => {
    return content
      .replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>')
      .replace(/\n/g, '<br>')
  }

  return (
    <div className="app">
      <header className="header">
        <div className="controls">
          <div className="selector">
            <label>Path:</label>
            <select 
              value={currentPath} 
              onChange={handlePathChange}
              className="select"
            >
              {paths.map(path => (
                <option key={path.value} value={path.value}>
                  {path.label}
                </option>
              ))}
            </select>
          </div>
          <div className="selector">
            <label>AI:</label>
            <select 
              value={currentProvider} 
              onChange={handleProviderChange}
              className="select"
            >
              {providers.map(provider => (
                <option key={provider.value} value={provider.value}>
                  {provider.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="chat-container">
        <div className="messages">
          {messages.map(message => (
            <div 
              key={message.id} 
              className={`message ${message.role}`}
            >
              {message.role === 'assistant' && message.provider && (
                <div className={`provider-badge ${message.provider}`}>
                  {message.provider}
                </div>
              )}
              <div 
                className="message-content"
                dangerouslySetInnerHTML={{ 
                  __html: message.role === 'assistant' 
                    ? formatContent(message.content) 
                    : message.content 
                }}
              />
            </div>
          ))}
          {isLoading && (
            <div className="message assistant">
              <div className="typing-indicator">
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="input-container">
        <div className="input-group">
          <input
            type="text"
            className="input-field"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask AI assistant..."
            disabled={isLoading}
          />
          <button 
            className="send-button" 
            onClick={sendMessage}
            disabled={isLoading || !inputMessage.trim()}
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  )
}

export default App