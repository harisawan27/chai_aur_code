import express from 'express';
import { GoogleGenAI } from '@google/genai';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';

const app = express();
app.use(cors());
app.use(express.json());

delete process.env.GOOGLE_API_KEY;
console.log("SERVER BOOT:", "GOOGLE:", process.env.GOOGLE_API_KEY, "GEMINI:", process.env.GEMINI_API_KEY?.substring(0, 5));
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const STARTUP_ROLES = [
  { key: 'CEO', title: 'CEO', prompt: 'You are the CEO. Focus on vision, growth, and overall strategy.' },
  { key: 'CFO', title: 'CFO', prompt: 'You are the CFO. Focus on financial risks, budget, and ROI.' },
  { key: 'CTO', title: 'CTO', prompt: 'You are the CTO. Focus on technical feasibility and architecture.' },
];

app.post('/api/chat/stream', async (req, res) => {
  const { prompt } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (type: string, data: any) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  sendEvent('roles', { data: STARTUP_ROLES });

  try {
    const specialistTexts: Record<string, string> = {};
    
    // Run agents in parallel
    await Promise.all(STARTUP_ROLES.map(async (role) => {
      sendEvent('status', { agent: role.key, status: 'thinking' });
      
      try {
        const response = await ai.models.generateContentStream({
          model: 'gemini-1.5-flash',
          contents: `User Decision: ${prompt}\n\nYour Role: ${role.prompt}\n\nProvide your analysis.`,
        });

        let fullText = '';
        for await (const chunk of response) {
          if (chunk.text) {
            fullText += chunk.text;
            sendEvent('chunk', { agent: role.key, text: chunk.text });
          }
        }
        specialistTexts[role.key] = fullText;
        sendEvent('final', { agent: role.key, text: fullText, thinking: '' });
      } catch (err: any) {
        sendEvent('error', { message: err.message });
      }
    }));

    // Run moderator
    sendEvent('status', { agent: 'Moderator', status: 'thinking' });
    let modPrompt = `User Decision: ${prompt}\n\nAnalyses:\n`;
    for (const role of STARTUP_ROLES) {
      modPrompt += `\n--- ${role.title} ---\n${specialistTexts[role.key]}\n`;
    }
    modPrompt += `\nSynthesize these analyses into a JSON report with keys: final_decision, confidence_score, key_risks, recommended_actions, debate_summary.`;

    const modResponse = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: modPrompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const report = JSON.parse(modResponse.text || "{}");
    sendEvent('report', { data: report });
    sendEvent('done', {});
    res.end();

  } catch (error: any) {
    sendEvent('error', { message: error.message });
    res.end();
  }
});

app.post('/api/chat/stream_message', async (req, res) => {
  const { message } = req.body;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const response = await ai.models.generateContentStream({
      model: 'gemini-1.5-flash',
      contents: message,
    });
    for await (const chunk of response) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk.text })}\n\n`);
      }
    }
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

// Vite Integration for production/dev
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(3000, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:3000`);
  });
}

startServer();
