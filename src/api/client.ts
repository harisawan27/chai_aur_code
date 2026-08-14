// ---------------------------------------------------------------------------
// Role info type (sent by backend at start of each meeting)
// ---------------------------------------------------------------------------
export interface RoleInfo {
  key: string;
  name: string;
  title: string;
  icon: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Streaming Chat
// ---------------------------------------------------------------------------
export async function streamChat(
  sessionId: string | null,
  template: string,
  prompt: string,
  onRoles: (roles: RoleInfo[]) => void,
  onThinking: (agent: string, text: string) => void,
  onChunk: (agent: string, text: string) => void,
  onStatus: (agent: string, status: string, message?: string) => void,
  onReport: (report: any) => void,
  onError: (error: string) => void,
  onComplete: () => void,
  abortSignal?: AbortSignal,
  onFinal?: (agent: string, text: string, thinking: string) => void
) {
  try {
    const response = await fetch(`/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template, prompt, session_id: sessionId }),
      signal: abortSignal,
    });

    if (!response.body) throw new Error("ReadableStream not supported");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.substring(6);
          try {
            const data = JSON.parse(dataStr);
            switch (data.type) {
              case "roles":
                onRoles(data.data);
                break;
              case "status":
                onStatus(data.agent, data.status, data.message);
                break;
              case "thinking":
                onThinking(data.agent, data.text);
                break;
              case "chunk":
                onChunk(data.agent, data.text);
                break;
              case "final":
                if (onFinal) onFinal(data.agent, data.text, data.thinking || "");
                break;
              case "report":
                onReport(data.data);
                break;
              case "error":
                onError(data.message);
                break;
            }
          } catch (e) {
            console.error("Failed to parse SSE data", e, dataStr);
          }
        }
      }
    }
    onComplete();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      onError("Generation stopped.");
    } else {
      onError(error instanceof Error ? error.message : "Stream failed");
    }
    onComplete();
  }
}

export async function healthCheck(): Promise<boolean> {
  return true;
}

// ---------------------------------------------------------------------------
// Auth Mock
// ---------------------------------------------------------------------------
export async function login(email: string, password: string): Promise<string> {
  localStorage.setItem("token", "mock_token");
  return "mock_token";
}
export async function register(email: string, password: string): Promise<string> {
  localStorage.setItem("token", "mock_token");
  return "mock_token";
}
export async function fetchMeetings(): Promise<any[]> {
  const data = localStorage.getItem("meetings");
  return data ? JSON.parse(data) : [];
}
export async function getMe(): Promise<any> {
  return { id: "1", email: "user@example.com", profile_data: {} };
}
export async function updateProfile(profileData: any): Promise<any> {
  return profileData;
}
export async function deleteAccount(): Promise<any> {
  localStorage.clear();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Copilot Chat Sessions (LocalStorage Mock)
// ---------------------------------------------------------------------------
export async function createSession(): Promise<any> {
  const sessions = await getSessions();
  const newSession = { id: Date.now().toString(), title: "New Session", created_at: new Date().toISOString() };
  sessions.push(newSession);
  localStorage.setItem("sessions", JSON.stringify(sessions));
  return newSession;
}
export async function getSessions(): Promise<any[]> {
  const data = localStorage.getItem("sessions");
  return data ? JSON.parse(data) : [];
}
export async function getSession(sessionId: string): Promise<any> {
  const sessions = await getSessions();
  const s = sessions.find(s => s.id === sessionId) || null;
  if (s) {
    s.messages = JSON.parse(localStorage.getItem(`messages_${sessionId}`) || "[]");
  }
  return s;
}
export async function renameSession(sessionId: string, title: string): Promise<any> {
  const sessions = await getSessions();
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx !== -1) {
    sessions[idx].title = title;
    localStorage.setItem("sessions", JSON.stringify(sessions));
  }
  return { success: true };
}
export async function deleteSession(sessionId: string): Promise<any> {
  const sessions = await getSessions();
  localStorage.setItem("sessions", JSON.stringify(sessions.filter(s => s.id !== sessionId)));
  return { success: true };
}
export async function deleteLastTurn(sessionId: string): Promise<any> {
  return { success: true };
}
export async function sendStandardMessage(sessionId: string, message: string): Promise<any> {
  const messages = JSON.parse(localStorage.getItem(`messages_${sessionId}`) || "[]");
  messages.push({ role: 'user', content: message, id: Date.now().toString() });
  localStorage.setItem(`messages_${sessionId}`, JSON.stringify(messages));
  return { success: true };
}
export async function streamStandardMessage(
  sessionId: string,
  message: string,
  onThinking: (text: string) => void,
  onChunk: (text: string) => void,
  onError: (error: string) => void,
  onComplete: () => void,
  abortSignal?: AbortSignal
) {
  try {
    const response = await fetch(`/api/chat/stream_message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message }),
      signal: abortSignal,
    });

    if (!response.ok) throw new Error("Stream failed");
    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullReply = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const dataStr = line.substring(6);
            if (!dataStr) continue;
            
            const data = JSON.parse(dataStr);
            if (data.type === "thinking" && data.text) {
              onThinking(data.text);
            } else if (data.type === "chunk" && data.text) {
              fullReply += data.text;
              onChunk(data.text);
            } else if (data.type === "error") {
              onError(data.message);
            } else if (data.type === "done") {
              // Save to localStorage
              const messages = JSON.parse(localStorage.getItem(`messages_${sessionId}`) || "[]");
              messages.push({ role: 'assistant', content: fullReply, id: Date.now().toString() });
              localStorage.setItem(`messages_${sessionId}`, JSON.stringify(messages));
              onComplete();
            }
          } catch (e) {
            console.error("Error parsing SSE line", line, e);
          }
        }
      }
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      onError("Generation stopped.");
    } else {
      onError(error.message);
    }
  }
}
