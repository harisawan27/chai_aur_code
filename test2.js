import { GoogleGenAI } from '@google/genai';
delete process.env.GOOGLE_API_KEY;
console.log("GOOGLE", process.env.GOOGLE_API_KEY, "GEMINI", !!process.env.GEMINI_API_KEY)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
ai.models.generateContent({ model: 'gemini-2.5-flash', contents: 'Hi' }).then(x => console.log(x.text)).catch(e => console.error(e.message));
