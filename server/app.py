from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import asyncio
import subprocess
import uuid
import os
import threading
import time
from datetime import datetime, timedelta
import json

app = FastAPI(title="Koder API", description="AI Code Assistant API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PORT = 3000

# Store sessions in memory
sessions: Dict[str, Dict[str, Any]] = {}

# Pydantic models
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="The message to send to the AI")
    path: str = Field(..., description="The working directory path")
    sessionId: Optional[str] = Field(None, description="Existing session ID")
    provider: str = Field(default="claude", pattern="^(claude|opencode)$", description="AI provider to use")

class ChatResponse(BaseModel):
    response: str = Field(..., description="AI response")
    sessionId: str = Field(..., description="Session ID")
    provider: str = Field(..., description="AI provider used")

class SessionEndResponse(BaseModel):
    success: bool = Field(..., description="Whether session was successfully ended")

class HealthResponse(BaseModel):
    status: str = Field(..., description="Health status")
    activeSessions: int = Field(..., description="Number of active sessions")
    sessionStats: Dict[str, int] = Field(..., description="Session counts by provider")

async def execute_ai(provider: str, command: str, cwd: str, session_id: Optional[str] = None) -> str:
    """Execute AI command (Claude or opencode) asynchronously"""
    try:
        if provider == 'claude':
            cmd = ['claude']
            # Add session handling if we have a session_id
            if session_id and session_id in sessions:
                cmd.extend(['--session-id', session_id])
            cmd.append(command)
        elif provider == 'opencode':
            cmd = ['python3', '/usr/local/bin/opencode', command]
            if session_id and session_id in sessions:
                cmd.extend(['--session', session_id])
        else:
            raise ValueError(f"Unknown provider: {provider}")
        
        # Run the command asynchronously
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            limit=1024*1024  # 1MB buffer limit
        )
        
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), 
            timeout=300.0  # 5 minute timeout
        )
        
        if process.returncode == 0:
            return stdout.decode('utf-8')
        else:
            error_msg = stderr.decode('utf-8') or f"Command failed with code {process.returncode}"
            raise RuntimeError(error_msg)
            
    except asyncio.TimeoutError:
        raise RuntimeError("Command timed out after 5 minutes")
    except FileNotFoundError as e:
        raise RuntimeError(f"Command not found: {e.filename}")

def cleanup_sessions():
    """Clean up old sessions (older than 30 minutes)"""
    while True:
        try:
            now = datetime.now()
            expired_sessions = []
            
            for session_id, session_data in sessions.items():
                created_at = session_data.get('createdAt')
                if isinstance(created_at, str):
                    created_at = datetime.fromisoformat(created_at)
                if created_at and now - created_at > timedelta(minutes=30):
                    expired_sessions.append(session_id)
            
            for session_id in expired_sessions:
                del sessions[session_id]
                
        except Exception as e:
            print(f"Error cleaning up sessions: {e}")
        
        time.sleep(300)  # Check every 5 minutes

# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_sessions, daemon=True)
cleanup_thread.start()

@app.get("/")
async def root():
    """Serve the main HTML file"""
    from fastapi.responses import FileResponse
    return FileResponse('public/index.html')

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Handle chat requests"""
    try:
        # Create new session if needed
        session_id = request.sessionId
        if not session_id:
            session_id = str(uuid.uuid4())
            sessions[session_id] = {
                'createdAt': datetime.now().isoformat(),
                'path': request.path,
                'provider': request.provider
            }
        
        # Execute AI command asynchronously
        response = await execute_ai(request.provider, request.message, request.path, session_id)
        
        return ChatResponse(
            response=response,
            sessionId=session_id,
            provider=request.provider
        )
        
    except Exception as error:
        print(f'Error executing AI: {error}')
        raise HTTPException(
            status_code=500,
            detail={
                'error': 'Failed to execute command',
                'details': str(error)
            }
        )

@app.post("/api/session/{session_id}/end", response_model=SessionEndResponse)
async def end_session(session_id: str):
    """End a session"""
    if session_id in sessions:
        del sessions[session_id]
        return SessionEndResponse(success=True)
    else:
        raise HTTPException(status_code=404, detail="Session not found")

@app.get("/api/health", response_model=HealthResponse)
async def health():
    """Health check endpoint"""
    session_stats = {}
    for session_data in sessions.values():
        provider = session_data.get('provider', 'claude')
        session_stats[provider] = session_stats.get(provider, 0) + 1
    
    return HealthResponse(
        status='ok',
        activeSessions=len(sessions),
        sessionStats=session_stats
    )

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Serve React app
@app.get("/")
async def read_root():
    """Serve the React app"""
    from fastapi.responses import FileResponse
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    print(f"AI Code Server running on port {PORT}")
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=PORT,
        reload=False,
        access_log=True
    )