import express from 'express';
import { GoogleGenAI } from '@google/genai';
delete process.env.GOOGLE_API_KEY;
const app = express();
app.use(express.json());
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
app.post('/test', async (req, res) => {
  try {
    const response = await ai.models.generateContentStream({ model: 'gemini-2.5-flash', contents: 'Hi' });
    let text = '';
    for await (const chunk of response) text += chunk.text;
    res.send(text);
  } catch (e) {
    res.status(500).send(e.message);
  }
});
app.listen(3001, () => console.log('started'));
