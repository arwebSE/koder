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

PORT = 5174

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

class UsageResponse(BaseModel):
    usage: str = Field(..., description="Usage statistics from claude CLI")
    timestamp: str = Field(..., description="When usage was fetched")

class SessionInfo(BaseModel):
    sessionId: str = Field(..., description="Session ID")
    path: str = Field(..., description="Working directory path")
    createdAt: str = Field(..., description="ISO timestamp of creation")

class SessionsListResponse(BaseModel):
    sessions: list[SessionInfo] = Field(..., description="List of available sessions")

async def execute_ai(provider: str, command: str, cwd: str, session_id: Optional[str] = None) -> str:
    """Execute AI command (Claude or opencode) asynchronously"""
    try:
        if provider == 'claude':
            cmd = ['claude', '--print']
            # Add session handling if we have a session_id
            if session_id and session_id in sessions:
                cmd.extend(['--session-id', session_id])
            cmd.append(command)
        elif provider == 'opencode':
            # On Windows, opencode is an npm package; on Unix, it's a Python script
            if os.name == 'nt':
                cmd = ['opencode', 'run', command]
            else:
                cmd = ['python3', '/usr/local/bin/opencode', 'run', command]
            if session_id and session_id in sessions:
                cmd.extend(['--session', session_id])
        else:
            raise ValueError(f"Unknown provider: {provider}")
        
        # Run the command asynchronously
        # On Windows, we need shell=True for .cmd files
        shell_needed = os.name == 'nt' and provider == 'opencode'

        if shell_needed:
            # For shell mode, join cmd into a single string
            cmd_str = ' '.join(f'"{arg}"' if ' ' in arg else arg for arg in cmd)
            process = await asyncio.create_subprocess_shell(
                cmd_str,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                limit=1024*1024  # 1MB buffer limit
            )
        else:
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
            return stdout.decode('utf-8', errors='replace')
        else:
            error_msg = stderr.decode('utf-8', errors='replace') or f"Command failed with code {process.returncode}"
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
        error_str = str(error).encode('utf-8', errors='replace').decode('utf-8', errors='replace')
        print(f'Error executing AI: {error_str}')
        raise HTTPException(
            status_code=500,
            detail={
                'error': 'Failed to execute command',
                'details': error_str
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

@app.get("/api/usage", response_model=UsageResponse)
async def get_usage():
    """Get Claude CLI usage statistics"""
    try:
        # Try to parse from ~/.claude directory
        claude_dir = os.path.expanduser('~/.claude')
        usage_info = []

        if os.path.exists(claude_dir):
            # List session files
            sessions_dir = os.path.join(claude_dir, 'sessions')
            if os.path.exists(sessions_dir):
                session_files = [f for f in os.listdir(sessions_dir) if f.endswith('.json')]
                usage_info.append(f"Active Claude sessions: {len(session_files)}")

            # Check for config file
            config_file = os.path.join(claude_dir, 'config.json')
            if os.path.exists(config_file):
                try:
                    with open(config_file, 'r') as f:
                        config_data = json.load(f)
                        if 'model' in config_data:
                            usage_info.append(f"Default model: {config_data['model']}")
                except:
                    pass

            # Check for usage file
            usage_file = os.path.join(claude_dir, 'usage.json')
            if os.path.exists(usage_file):
                try:
                    with open(usage_file, 'r') as f:
                        usage_data = json.load(f)
                        usage_info.append("\nUsage Data:")
                        usage_info.append(json.dumps(usage_data, indent=2))
                except:
                    pass

        # Also add current server stats
        usage_info.append(f"\nServer Statistics:")
        usage_info.append(f"Active sessions in memory: {len(sessions)}")
        for provider, count in {}.items():
            usage_info.append(f"  {provider}: {count}")

        usage_text = '\n'.join(usage_info) if usage_info else "No usage data available. The Claude CLI does not provide usage statistics via command line."

        return UsageResponse(
            usage=usage_text,
            timestamp=datetime.now().isoformat()
        )

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))

@app.get("/api/sessions", response_model=SessionsListResponse)
async def list_sessions():
    """List all active sessions"""
    try:
        session_list = []

        # First, get sessions from in-memory storage
        for session_id, session_data in sessions.items():
            session_list.append(SessionInfo(
                sessionId=session_id,
                path=session_data.get('path', ''),
                createdAt=session_data.get('createdAt', '')
            ))

        # Also try to read from Claude's session directory
        claude_sessions_dir = os.path.expanduser('~/.claude/sessions')
        if os.path.exists(claude_sessions_dir):
            for filename in os.listdir(claude_sessions_dir):
                if filename.endswith('.json'):
                    session_id = filename[:-5]  # Remove .json
                    if session_id not in sessions:
                        # Try to read session metadata
                        session_file = os.path.join(claude_sessions_dir, filename)
                        try:
                            with open(session_file, 'r') as f:
                                session_data = json.load(f)
                                session_list.append(SessionInfo(
                                    sessionId=session_id,
                                    path=session_data.get('path', 'Unknown'),
                                    createdAt=session_data.get('createdAt', datetime.now().isoformat())
                                ))
                        except:
                            pass

        # Sort by creation time (newest first)
        session_list.sort(key=lambda x: x.createdAt, reverse=True)

        return SessionsListResponse(sessions=session_list)

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))

# Serve React app
@app.get("/")
async def read_root():
    """Serve the React app"""
    from fastapi.responses import FileResponse
    return FileResponse("static/index.html")

# Mount static files - must come after route definitions
app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")
app.mount("/", StaticFiles(directory="static", html=True), name="static")

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